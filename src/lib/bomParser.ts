import type { ImportedOrder, ImportedLineItem, ImportedTool, PartsCatalogItem } from '@/types';
import { resolveHierarchyLeaves } from './hierarchyUtils';
import type { HierarchyRow } from './hierarchyUtils';

/**
 * Multi-level BOM CSV parser and merger for multi-BOM imports.
 *
 * Handles Sonovision-style BOMs that are multi-level (up to 5 levels deep),
 * extracting only leaf-level parts for picking.
 */

// Represents a single parsed leaf part from one BOM
export interface ParsedLeafPart {
  partNumber: string;
  description: string;
  qty: number; // Effective quantity (multiplied through hierarchy)
  assemblyGroup: string; // Top-level parent assembly part number
  type: string; // MFG, PUR, etc.
}

// Result from parsing a single BOM CSV
export interface ParsedBOM {
  toolModel: string; // Extracted from filename
  leafParts: ParsedLeafPart[];
  warnings: string[];
}

// Represents a merged line item across BOMs
export interface MergedLineItem {
  partNumber: string;
  description: string;
  assemblyGroup: string;
  qtyPerUnit: number;
  toolModels: string[]; // Which tool models need this part
  isShared: boolean; // true if all BOMs need this part at same qty
}

// Result from merging multiple BOMs
export interface MergedBOMResult {
  lineItems: MergedLineItem[];
  allToolModels: string[];
  stats: {
    totalParts: number;
    sharedCount: number;
    toolSpecificCount: number;
  };
}

// Mapping from tool model to tool info
export interface ToolMapping {
  toolModel: string;
  toolNumber: string; // e.g., "3930-1"
}

/**
 * Parse a multi-level BOM CSV file and extract leaf-only parts.
 *
 * Expected CSV format:
 * - Lines starting with # are comments (skipped)
 * - Lines containing Σ are summary/total lines (skipped)
 * - Header row contains: Level, Part Number, Type, Qty, ...
 * - Data rows have a numeric Level indicating hierarchy depth
 * - Leaf parts are those NOT followed by a deeper-level child
 *
 * Quantities are multiplied through the hierarchy: if a level-2 assembly
 * has qty 2 and its level-3 child has qty 3, the effective leaf qty is 6.
 */
export function parseBOMCsv(csvText: string, filename: string): ParsedBOM {
  const warnings: string[] = [];
  const lines = csvText.split(/\r?\n/);

  // Extract tool model from filename (e.g., "230QR-10002.csv" -> "230QR-10002")
  const toolModel = filename.replace(/\.csv$/i, '').trim();

  // Find header row and column indices
  let headerIndex = -1;
  let levelCol = -1;
  let partNumberCol = -1;
  let typeCol = -1;
  let qtyCol = -1;
  let descriptionCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.includes('\u03A3')) continue;

    // Try to detect header row by looking for "Level" and "Part Number" columns
    const cells = parseCSVLine(line);
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

  // Parse data rows
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

    const cells = parseCSVLine(line);

    const levelStr = cells[levelCol]?.trim() || '';
    const level = parseInt(levelStr, 10);
    if (isNaN(level)) continue; // Skip non-data rows

    const partNumber = cells[partNumberCol]?.trim() || '';
    if (!partNumber) continue;

    const type = typeCol >= 0 ? (cells[typeCol]?.trim() || '') : '';
    const rawQty = cells[qtyCol]?.trim() || '1';
    const qty = parseEuropeanNumber(rawQty);
    const description = descriptionCol >= 0 ? (cells[descriptionCol]?.trim() || '') : '';

    dataRows.push({ level, partNumber, type, qty, description });
  }

  if (dataRows.length === 0) {
    warnings.push(`No data rows found in ${filename}`);
    return { toolModel, leafParts: [], warnings };
  }

  // Resolve leaf parts using shared hierarchy utility
  const hierarchyRows: HierarchyRow[] = dataRows.map(r => ({
    level: r.level,
    partNumber: r.partNumber,
    qty: r.qty,
    description: r.description,
  }));

  const resolvedLeaves = resolveHierarchyLeaves(hierarchyRows);

  // Build a type lookup from dataRows for the resolved leaves
  const typeByPartNumber = new Map<string, string>();
  for (const r of dataRows) {
    if (!typeByPartNumber.has(r.partNumber)) {
      typeByPartNumber.set(r.partNumber, r.type);
    }
  }

  const leafParts: ParsedLeafPart[] = resolvedLeaves.map(leaf => ({
    partNumber: leaf.partNumber,
    description: leaf.description,
    qty: leaf.effectiveQty,
    assemblyGroup: leaf.assemblyGroup,
    type: typeByPartNumber.get(leaf.partNumber) || '',
  }));

  return { toolModel, leafParts, warnings };
}

/**
 * Merge leaf parts from multiple parsed BOMs.
 *
 * Identifies shared parts (same part, same qty across all BOMs) vs
 * tool-specific parts (only some BOMs, or different quantities).
 */
export function mergeMultipleBOMs(
  parsedBOMs: ParsedBOM[],
  toolMappings: ToolMapping[]
): MergedBOMResult {
  const allToolModels = parsedBOMs.map(b => b.toolModel);

  // Build a model->toolNumber map
  const modelToToolNumber = new Map<string, string>();
  for (const tm of toolMappings) {
    modelToToolNumber.set(tm.toolModel, tm.toolNumber);
  }

  // Build per-BOM maps: partNumber -> { qty, assemblyGroup, description }
  type PartInfo = { qty: number; assemblyGroup: string; description: string };
  const bomMaps: Map<string, Map<string, PartInfo>> = new Map();

  for (const bom of parsedBOMs) {
    const partMap = new Map<string, PartInfo>();
    for (const leaf of bom.leafParts) {
      const existing = partMap.get(leaf.partNumber);
      if (existing) {
        // Same part appears multiple times in one BOM (different assemblies)
        // Sum the quantities
        existing.qty += leaf.qty;
        // Keep first assembly group encountered
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

  // Collect all unique part numbers across all BOMs
  const allPartNumbers = new Set<string>();
  for (const [, partMap] of bomMaps) {
    for (const pn of partMap.keys()) {
      allPartNumbers.add(pn);
    }
  }

  // For each unique part, determine if shared or tool-specific
  const lineItems: MergedLineItem[] = [];

  for (const partNumber of allPartNumbers) {
    // Collect qty and info per BOM for this part
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

    const firstEntry = perBOM[0];
    const uniqueQtys = new Set(perBOM.map(e => e.qty));

    if (uniqueQtys.size === 1) {
      // All BOMs have the same qty — single line item
      const toolModels = perBOM.map(e => e.toolModel);
      const isShared = toolModels.length === parsedBOMs.length;
      lineItems.push({
        partNumber,
        description: firstEntry.description,
        assemblyGroup: firstEntry.assemblyGroup,
        qtyPerUnit: perBOM[0].qty,
        toolModels,
        isShared,
      });
    } else {
      // Different qtys across BOMs — split into one line item per qty group
      const qtyGroups = new Map<number, string[]>();
      for (const entry of perBOM) {
        const existing = qtyGroups.get(entry.qty) || [];
        existing.push(entry.toolModel);
        qtyGroups.set(entry.qty, existing);
      }

      for (const [qty, toolModels] of qtyGroups) {
        lineItems.push({
          partNumber,
          description: firstEntry.description,
          assemblyGroup: firstEntry.assemblyGroup,
          qtyPerUnit: qty,
          toolModels,
          isShared: false, // tool-specific since different qtys
        });
      }
    }
  }

  // Sort: shared items first, then by assembly group, then by part number
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

/**
 * Build an ImportedOrder from merged BOM results, compatible with existing importOrder().
 */
export function buildImportedOrder(
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
): ImportedOrder {
  // Build catalog lookup for auto-filling descriptions/locations
  const catalogMap = new Map<string, PartsCatalogItem>();
  if (catalogParts) {
    for (const part of catalogParts) {
      catalogMap.set(part.part_number, part);
    }
  }

  // Build model -> tool number map
  const modelToToolNumber = new Map<string, string>();
  for (const tm of toolMappings) {
    modelToToolNumber.set(tm.toolModel, tm.toolNumber);
  }

  // Create tools
  const tools: ImportedTool[] = toolMappings.map(tm => ({
    tool_number: tm.toolNumber,
    tool_model: tm.toolModel,
  }));

  // Create line items
  const lineItems: ImportedLineItem[] = mergedResult.lineItems.map(item => {
    const catalogEntry = catalogMap.get(item.partNumber);

    // Use catalog description/location if available, otherwise use BOM description
    const description = catalogEntry?.description || item.description || undefined;
    const location = catalogEntry?.default_location || undefined;

    // Determine tool_ids
    let toolIds: string[] | undefined;
    if (!item.isShared) {
      // Map tool models to temp tool IDs (temp-{tool_number})
      toolIds = item.toolModels
        .map(model => {
          const toolNumber = modelToToolNumber.get(model);
          return toolNumber ? `temp-${toolNumber}` : undefined;
        })
        .filter((id): id is string => id !== undefined);

      if (toolIds.length === 0) toolIds = undefined;
    }

    const totalQtyNeeded = item.qtyPerUnit * (toolIds ? toolIds.length : tools.length);

    return {
      part_number: item.partNumber,
      description,
      location,
      qty_per_unit: item.qtyPerUnit,
      total_qty_needed: totalQtyNeeded,
      tool_ids: toolIds,
      assembly_group: item.assemblyGroup || undefined,
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

// --- Utility functions ---

/**
 * Parse a CSV line handling quoted fields with commas inside.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
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

/**
 * Parse a number that may use European format (comma as decimal separator).
 * Examples: "114,32" -> 114.32, "3" -> 3, "1.5" -> 1.5
 */
function parseEuropeanNumber(value: string): number {
  if (!value) return 0;

  // Clean up whitespace
  let cleaned = value.trim();

  // If the value contains both periods and commas, assume period = thousands, comma = decimal
  // (European format: 1.234,56)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  // If only comma and it looks like a decimal (single comma, digits after)
  else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Check if it's likely a decimal: only one comma and <= 3 digits after it
    const commaPos = cleaned.lastIndexOf(',');
    const afterComma = cleaned.substring(commaPos + 1);
    if (afterComma.length <= 3 && /^\d+$/.test(afterComma)) {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
