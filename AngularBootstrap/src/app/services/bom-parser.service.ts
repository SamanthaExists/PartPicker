import { Injectable } from '@angular/core';
import { ImportedOrder, ImportedLineItem, ImportedTool, PartsCatalogItem } from '../models';
import { PartsService, Part } from './parts.service';
import { PartRelationshipsService } from './part-relationships.service';

export interface ParsedLeafPart {
  partNumber: string;
  description: string;
  qty: number;
  assemblyGroup: string;
  type: string;
}

export interface ParsedBOM {
  toolModel: string;
  leafParts: ParsedLeafPart[];
  warnings: string[];
}

export interface MergedLineItem {
  partNumber: string;
  description: string;
  assemblyGroup: string;
  qtyPerUnit: number;
  toolModels: string[];
  isShared: boolean;
}

export interface MergedBOMResult {
  lineItems: MergedLineItem[];
  allToolModels: string[];
  stats: {
    totalParts: number;
    sharedCount: number;
    toolSpecificCount: number;
  };
}

export interface ToolMapping {
  toolModel: string;
  toolNumber: string;
}

@Injectable({
  providedIn: 'root'
})
export class BomParserService {
  constructor(
    private partsService: PartsService,
    private partRelationshipsService: PartRelationshipsService
  ) {}

  parseBOMCsv(csvText: string, filename: string): ParsedBOM {
    const warnings: string[] = [];
    const lines = csvText.split(/\r?\n/);
    const toolModel = filename.replace(/\.csv$/i, '').trim();

    let headerIndex = -1;
    let levelCol = -1;
    let partNumberCol = -1;
    let typeCol = -1;
    let qtyCol = -1;
    let descriptionCol = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.includes('\u03A3')) continue;

      const cells = this.parseCSVLine(line);
      const lowerCells = cells.map(c => c.toLowerCase().trim());

      const lvlIdx = lowerCells.findIndex(c => c === 'level' || c === 'lvl');
      const pnIdx = lowerCells.findIndex(c =>
        c === 'part number' || c === 'part_number' || c === 'partnumber' ||
        c === 'part no' || c === 'part no.' || c === 'pn' || c === 'ref_pn'
      );

      if (lvlIdx !== -1 && pnIdx !== -1) {
        headerIndex = i;
        levelCol = lvlIdx;
        partNumberCol = pnIdx;
        typeCol = lowerCells.findIndex(c => c === 'type' || c === 'make/buy' || c === 'make_buy');
        qtyCol = lowerCells.findIndex(c =>
          c === 'qty' || c === 'quantity' || c === 'qty per' || c === 'qty/assy' ||
          c === 'qty ea' || c === 'qty needed'
        );
        descriptionCol = lowerCells.findIndex(c =>
          c === 'description' || c === 'desc' || c === 'name' || c === 'part description'
        );
        break;
      }
    }

    if (headerIndex === -1) {
      warnings.push(`Could not find header row in ${filename}`);
      return { toolModel, leafParts: [], warnings };
    }

    if (qtyCol === -1) {
      warnings.push(`No quantity column found in ${filename}`);
      return { toolModel, leafParts: [], warnings };
    }

    interface RowData {
      level: number;
      partNumber: string;
      type: string;
      qty: number;
      description: string;
    }

    const dataRows: RowData[] = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.includes('\u03A3')) continue;

      const cells = this.parseCSVLine(line);
      const levelStr = cells[levelCol]?.trim() || '';
      const level = parseInt(levelStr, 10);
      if (isNaN(level)) continue;

      const partNumber = cells[partNumberCol]?.trim() || '';
      if (!partNumber) continue;

      const type = typeCol >= 0 ? (cells[typeCol]?.trim() || '') : '';
      const rawQty = cells[qtyCol]?.trim() || '1';
      const qty = this.parseEuropeanNumber(rawQty);
      const description = descriptionCol >= 0 ? (cells[descriptionCol]?.trim() || '') : '';

      dataRows.push({ level, partNumber, type, qty, description });
    }

    if (dataRows.length === 0) {
      warnings.push(`No data rows found in ${filename}`);
      return { toolModel, leafParts: [], warnings };
    }

    const assemblyStack = new Map<number, { partNumber: string; effectiveQty: number }>();
    const leafParts: ParsedLeafPart[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const nextRow = i + 1 < dataRows.length ? dataRows[i + 1] : null;
      const isLeaf = !nextRow || nextRow.level <= row.level;

      let parentEffectiveQty = 1;
      for (let lvl = row.level - 1; lvl >= 0; lvl--) {
        const ancestor = assemblyStack.get(lvl);
        if (ancestor) {
          parentEffectiveQty = ancestor.effectiveQty;
          break;
        }
      }

      const effectiveQty = row.qty * parentEffectiveQty;
      assemblyStack.set(row.level, { partNumber: row.partNumber, effectiveQty });

      for (const [lvl] of assemblyStack) {
        if (lvl > row.level) {
          assemblyStack.delete(lvl);
        }
      }

      let assemblyGroup = '';
      for (let lvl = 1; lvl >= 0; lvl--) {
        const ancestor = assemblyStack.get(lvl);
        if (ancestor) {
          assemblyGroup = ancestor.partNumber;
          break;
        }
      }
      if (row.level <= 1) {
        assemblyGroup = row.partNumber;
      }

      if (isLeaf) {
        const finalQty = Math.max(1, Math.ceil(effectiveQty));
        leafParts.push({
          partNumber: row.partNumber,
          description: row.description,
          qty: finalQty,
          assemblyGroup,
          type: row.type,
        });
      }
    }

    return { toolModel, leafParts, warnings };
  }

  mergeMultipleBOMs(parsedBOMs: ParsedBOM[], toolMappings: ToolMapping[]): MergedBOMResult {
    const allToolModels = parsedBOMs.map(b => b.toolModel);

    type PartInfo = { qty: number; assemblyGroup: string; description: string };
    const bomMaps = new Map<string, Map<string, PartInfo>>();

    for (const bom of parsedBOMs) {
      const partMap = new Map<string, PartInfo>();
      for (const leaf of bom.leafParts) {
        const existing = partMap.get(leaf.partNumber);
        if (existing) {
          existing.qty += leaf.qty;
        } else {
          partMap.set(leaf.partNumber, {
            qty: leaf.qty,
            assemblyGroup: leaf.assemblyGroup,
            description: leaf.description,
          });
        }
      }
      bomMaps.set(bom.toolModel, partMap);
    }

    const allPartNumbers = new Set<string>();
    for (const [, partMap] of bomMaps) {
      for (const pn of partMap.keys()) {
        allPartNumbers.add(pn);
      }
    }

    const lineItems: MergedLineItem[] = [];

    for (const partNumber of allPartNumbers) {
      const perBOM: { toolModel: string; qty: number; assemblyGroup: string; description: string }[] = [];
      for (const bom of parsedBOMs) {
        const partMap = bomMaps.get(bom.toolModel);
        const info = partMap?.get(partNumber);
        if (info) {
          perBOM.push({
            toolModel: bom.toolModel,
            qty: info.qty,
            assemblyGroup: info.assemblyGroup,
            description: info.description,
          });
        }
      }

      const qtyGroups = new Map<number, typeof perBOM>();
      for (const entry of perBOM) {
        const group = qtyGroups.get(entry.qty) || [];
        group.push(entry);
        qtyGroups.set(entry.qty, group);
      }

      const firstEntry = perBOM[0];

      for (const [qty, group] of qtyGroups) {
        const toolModels = group.map(g => g.toolModel);
        const isShared = toolModels.length === parsedBOMs.length && qtyGroups.size === 1;

        lineItems.push({
          partNumber,
          description: firstEntry.description,
          assemblyGroup: firstEntry.assemblyGroup,
          qtyPerUnit: qty,
          toolModels,
          isShared,
        });
      }
    }

    lineItems.sort((a, b) => {
      if (a.isShared !== b.isShared) return a.isShared ? -1 : 1;
      const agCmp = a.assemblyGroup.localeCompare(b.assemblyGroup);
      if (agCmp !== 0) return agCmp;
      return a.partNumber.localeCompare(b.partNumber);
    });

    const sharedCount = lineItems.filter(li => li.isShared).length;

    return {
      lineItems,
      allToolModels,
      stats: {
        totalParts: lineItems.length,
        sharedCount,
        toolSpecificCount: lineItems.length - sharedCount,
      },
    };
  }

  async buildImportedOrder(
    mergedResult: MergedBOMResult,
    orderInfo: {
      soNumber: string;
      poNumber?: string;
      customerName?: string;
      purchaseDate?: string;
      dueDate?: string;
      estimatedShipDate?: string;
    },
    toolMappings: ToolMapping[],
    catalogParts?: PartsCatalogItem[]
  ): Promise<ImportedOrder> {
    const catalogMap = new Map<string, PartsCatalogItem>();
    if (catalogParts) {
      for (const part of catalogParts) {
        catalogMap.set(part.part_number, part);
      }
    }

    const modelToToolNumber = new Map<string, string>();
    for (const tm of toolMappings) {
      modelToToolNumber.set(tm.toolModel, tm.toolNumber);
    }

    const tools: ImportedTool[] = toolMappings.map(tm => ({
      tool_number: tm.toolNumber,
      tool_model: tm.toolModel,
    }));

    // Create a map to track created parts by part number
    const partsMap = new Map<string, Part>();

    // First pass: Create or find all parts (assemblies and components)
    for (const item of mergedResult.lineItems) {
      const catalogEntry = catalogMap.get(item.partNumber);
      const description = catalogEntry?.description || item.description || null;
      const location = catalogEntry?.default_location || null;

      // Determine if this part is an assembly (has an assembly_group that matches its own part_number)
      const isAssembly = item.assemblyGroup === item.partNumber;

      try {
        const part = await this.partsService.findOrCreatePart(
          item.partNumber,
          description,
          location,
          null // classification_type will be set later if needed
        );

        // Mark as assembly if needed
        if (isAssembly && !part.is_assembly) {
          await this.partsService.updatePart(part.id, { is_assembly: true });
          part.is_assembly = true;
        }

        partsMap.set(item.partNumber, part);
      } catch (err) {
        console.error(`Error creating/finding part ${item.partNumber}:`, err);
      }
    }

    // Second pass: Create relationships between assemblies and components
    const relationshipsCreated = new Set<string>(); // Track "parentPN:childPN" to avoid duplicates

    for (const item of mergedResult.lineItems) {
      const assemblyGroupPN = item.assemblyGroup;
      if (!assemblyGroupPN || assemblyGroupPN === item.partNumber) {
        // Skip if no assembly group or if this is the assembly itself
        continue;
      }

      const parentPart = partsMap.get(assemblyGroupPN);
      const childPart = partsMap.get(item.partNumber);

      if (parentPart && childPart && parentPart.id !== childPart.id) {
        const relationshipKey = `${parentPart.id}:${childPart.id}`;
        if (!relationshipsCreated.has(relationshipKey)) {
          try {
            await this.partRelationshipsService.createRelationship(
              parentPart.id,
              childPart.id,
              item.qtyPerUnit,
              { skipCircularCheck: true } // Skip circular check for import speed
            );
            relationshipsCreated.add(relationshipKey);
          } catch (err) {
            console.error(`Error creating relationship ${assemblyGroupPN} -> ${item.partNumber}:`, err);
          }
        }
      }
    }

    // Third pass: Build line items with part_id populated
    const lineItems: ImportedLineItem[] = mergedResult.lineItems.map(item => {
      const catalogEntry = catalogMap.get(item.partNumber);
      const description = catalogEntry?.description || item.description || undefined;
      const location = catalogEntry?.default_location || undefined;
      const part = partsMap.get(item.partNumber);

      let toolIds: string[] | undefined;
      if (!item.isShared) {
        toolIds = item.toolModels
          .map(model => {
            const toolNumber = modelToToolNumber.get(model);
            return toolNumber ? `temp-${toolNumber}` : undefined;
          })
          .filter((id): id is string => id !== undefined);

        if (toolIds.length === 0) toolIds = undefined;
      }

      const numApplicableTools = toolIds ? toolIds.length : tools.length;
      const totalQtyNeeded = item.qtyPerUnit * numApplicableTools;

      return {
        part_number: item.partNumber,
        description,
        location,
        qty_per_unit: item.qtyPerUnit,
        total_qty_needed: totalQtyNeeded,
        tool_ids: toolIds,
        assembly_group: item.assemblyGroup || undefined, // Legacy text field for backward compatibility
        part_id: part?.id, // Structured foreign key to parts table
      };
    });

    return {
      so_number: orderInfo.soNumber,
      po_number: orderInfo.poNumber,
      customer_name: orderInfo.customerName,
      order_date: orderInfo.purchaseDate,
      due_date: orderInfo.dueDate,
      estimated_ship_date: orderInfo.estimatedShipDate,
      tools,
      line_items: lineItems,
    };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',' || ch === ';') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }

    result.push(current);
    return result;
  }

  private parseEuropeanNumber(value: string): number {
    if (!value) return 0;

    let cleaned = value.trim();

    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      const commaPos = cleaned.lastIndexOf(',');
      const afterComma = cleaned.substring(commaPos + 1);
      if (afterComma.length <= 3 && /^\d+$/.test(afterComma)) {
        cleaned = cleaned.replace(',', '.');
      }
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
}
