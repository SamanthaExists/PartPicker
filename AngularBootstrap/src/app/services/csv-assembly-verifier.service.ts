import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Part, PartRelationship } from '../models';

export interface AssemblyStructure {
  assemblyPartNumber: string;
  level: number;
  quantity: number;
  description: string;
  children: AssemblyStructure[];
}

export interface CSVAssemblyNode {
  level: number;
  partNumber: string;
  description: string;
  quantity: number;
  type: string;
}

export interface AssemblyDiscrepancy {
  type: 'missing_in_db' | 'missing_in_csv' | 'quantity_mismatch' | 'relationship_missing' | 'legacy_text_only';
  severity: 'error' | 'warning' | 'info';
  partNumber: string;
  parentPartNumber?: string;
  message: string;
  details: {
    csvQuantity?: number;
    dbQuantity?: number;
    csvStructure?: string;
    legacyAssemblyGroup?: string;
  };
}

export interface VerificationReport {
  soNumber: string;
  fileName: string;
  verifiedAt: string;
  csvAssemblies: AssemblyStructure[];
  discrepancies: AssemblyDiscrepancy[];
  summary: {
    totalParts: number;
    partsInDb: number;
    partsNotInDb: number;
    relationshipsVerified: number;
    relationshipsMissing: number;
    legacyTextOnly: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class CsvAssemblyVerifierService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  /**
   * Parse a CSV file and build assembly hierarchy
   */
  parseAssemblyHierarchy(csvText: string, fileName: string): AssemblyStructure[] {
    const lines = csvText.split(/\r?\n/);
    const assemblies: AssemblyStructure[] = [];

    // Find header row
    let headerIndex = -1;
    let levelCol = -1;
    let partNumberCol = -1;
    let descriptionCol = -1;
    let qtyCol = -1;
    let typeCol = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

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
        descriptionCol = lowerCells.findIndex(c =>
          c === 'description' || c === 'desc' || c === 'name' || c === 'part description'
        );
        qtyCol = lowerCells.findIndex(c =>
          c === 'qty' || c === 'quantity' || c === 'qty per' || c === 'qty/assy' ||
          c === 'qty ea' || c === 'qty needed'
        );
        typeCol = lowerCells.findIndex(c => c === 'type' || c === 'make/buy' || c === 'make_buy');
        break;
      }
    }

    if (headerIndex === -1) {
      throw new Error(`Could not find header row in ${fileName}`);
    }

    // Parse data rows
    const nodes: CSVAssemblyNode[] = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const cells = this.parseCSVLine(line);
      const levelStr = cells[levelCol]?.trim() || '';
      const level = parseInt(levelStr, 10);
      if (isNaN(level)) continue;

      const partNumber = cells[partNumberCol]?.trim() || '';
      if (!partNumber) continue;

      const description = descriptionCol >= 0 ? (cells[descriptionCol]?.trim() || '') : '';
      const rawQty = qtyCol >= 0 ? (cells[qtyCol]?.trim() || '1') : '1';
      const quantity = this.parseNumber(rawQty);
      const type = typeCol >= 0 ? (cells[typeCol]?.trim() || '') : '';

      nodes.push({ level, partNumber, description, quantity, type });
    }

    // Build hierarchical structure
    const stack: (AssemblyStructure & { level: number })[] = [];

    for (const node of nodes) {
      // Remove items from stack that are not ancestors of current node
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      const assemblyNode: AssemblyStructure & { level: number } = {
        assemblyPartNumber: node.partNumber,
        level: node.level,
        quantity: node.quantity,
        description: node.description,
        children: []
      };

      if (stack.length === 0) {
        // Top-level assembly
        assemblies.push(assemblyNode);
      } else {
        // Add as child to parent
        stack[stack.length - 1].children.push(assemblyNode);
      }

      stack.push(assemblyNode);
    }

    return assemblies;
  }

  /**
   * Verify CSV assembly structure against database
   */
  async verifyAgainstDatabase(
    csvAssemblies: AssemblyStructure[],
    orderId: string,
    fileName: string
  ): Promise<VerificationReport> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Get order info
      const { data: order, error: orderError } = await this.supabase.from('orders')
        .select('so_number')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Get all parts from database
      const { data: dbParts, error: partsError } = await this.supabase.from('parts')
        .select('*');

      if (partsError) throw partsError;

      // Get all part relationships
      const { data: dbRelationships, error: relError } = await this.supabase.from('part_relationships')
        .select('*');

      if (relError) throw relError;

      // Get line items with assembly_group field (legacy text format)
      const { data: lineItems, error: lineItemsError } = await this.supabase.from('line_items')
        .select('part_number, assembly_group, part_id')
        .eq('order_id', orderId);

      if (lineItemsError) throw lineItemsError;

      // Build discrepancy list
      const discrepancies: AssemblyDiscrepancy[] = [];
      const partsMap = new Map((dbParts || []).map(p => [p.part_number, p]));
      const relationshipsMap = new Map<string, PartRelationship[]>();

      // Group relationships by parent
      (dbRelationships || []).forEach(rel => {
        const key = rel.parent_part_id;
        if (!relationshipsMap.has(key)) {
          relationshipsMap.set(key, []);
        }
        relationshipsMap.get(key)!.push(rel);
      });

      // Track statistics
      let totalParts = 0;
      let partsInDb = 0;
      let partsNotInDb = 0;
      let relationshipsVerified = 0;
      let relationshipsMissing = 0;
      let legacyTextOnly = 0;

      // Recursively verify assembly structure
      const verifyNode = (node: AssemblyStructure, parentNode?: AssemblyStructure) => {
        totalParts++;

        const part = partsMap.get(node.assemblyPartNumber);

        // Check if part exists in database
        if (!part) {
          partsNotInDb++;
          discrepancies.push({
            type: 'missing_in_db',
            severity: 'error',
            partNumber: node.assemblyPartNumber,
            parentPartNumber: parentNode?.assemblyPartNumber,
            message: `Part "${node.assemblyPartNumber}" found in CSV but not in parts catalog`,
            details: {
              csvQuantity: node.quantity
            }
          });
        } else {
          partsInDb++;

          // Check if relationship exists (if this has a parent)
          if (parentNode) {
            const parentPart = partsMap.get(parentNode.assemblyPartNumber);
            if (parentPart) {
              const relationships = relationshipsMap.get(parentPart.id) || [];
              const matchingRel = relationships.find(r => {
                const childPart = (dbParts || []).find(p => p.id === r.child_part_id);
                return childPart?.part_number === node.assemblyPartNumber;
              });

              if (matchingRel) {
                relationshipsVerified++;

                // Check quantity mismatch
                if (matchingRel.quantity !== node.quantity) {
                  discrepancies.push({
                    type: 'quantity_mismatch',
                    severity: 'warning',
                    partNumber: node.assemblyPartNumber,
                    parentPartNumber: parentNode.assemblyPartNumber,
                    message: `Quantity mismatch for "${node.assemblyPartNumber}" under "${parentNode.assemblyPartNumber}"`,
                    details: {
                      csvQuantity: node.quantity,
                      dbQuantity: matchingRel.quantity
                    }
                  });
                }
              } else {
                relationshipsMissing++;
                discrepancies.push({
                  type: 'relationship_missing',
                  severity: 'error',
                  partNumber: node.assemblyPartNumber,
                  parentPartNumber: parentNode.assemblyPartNumber,
                  message: `Relationship missing in database: "${parentNode.assemblyPartNumber}" -> "${node.assemblyPartNumber}"`,
                  details: {
                    csvQuantity: node.quantity
                  }
                });
              }
            }
          }
        }

        // Check children
        node.children.forEach(child => verifyNode(child, node));
      };

      csvAssemblies.forEach(assembly => verifyNode(assembly));

      // Check for legacy text-only assemblies
      (lineItems || []).forEach(item => {
        if (item.assembly_group && !item.part_id) {
          legacyTextOnly++;
          discrepancies.push({
            type: 'legacy_text_only',
            severity: 'info',
            partNumber: item.part_number,
            message: `Part "${item.part_number}" uses legacy text-based assembly_group field`,
            details: {
              legacyAssemblyGroup: item.assembly_group
            }
          });
        }
      });

      // Generate report
      const report: VerificationReport = {
        soNumber: order?.so_number || 'Unknown',
        fileName,
        verifiedAt: new Date().toISOString(),
        csvAssemblies,
        discrepancies,
        summary: {
          totalParts,
          partsInDb,
          partsNotInDb,
          relationshipsVerified,
          relationshipsMissing,
          legacyTextOnly
        }
      };

      return report;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify assemblies';
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Generate a human-readable verification report
   */
  generateVerificationReport(report: VerificationReport): string {
    const lines: string[] = [];

    lines.push(`Assembly Verification Report`);
    lines.push(`============================`);
    lines.push(`SO Number: ${report.soNumber}`);
    lines.push(`File: ${report.fileName}`);
    lines.push(`Verified: ${new Date(report.verifiedAt).toLocaleString()}`);
    lines.push('');

    lines.push(`Summary`);
    lines.push(`-------`);
    lines.push(`Total Parts: ${report.summary.totalParts}`);
    lines.push(`Parts in Database: ${report.summary.partsInDb}`);
    lines.push(`Parts Not in Database: ${report.summary.partsNotInDb}`);
    lines.push(`Relationships Verified: ${report.summary.relationshipsVerified}`);
    lines.push(`Relationships Missing: ${report.summary.relationshipsMissing}`);
    lines.push(`Legacy Text-Only: ${report.summary.legacyTextOnly}`);
    lines.push('');

    if (report.discrepancies.length === 0) {
      lines.push(`✓ No discrepancies found. CSV matches database structure.`);
    } else {
      lines.push(`Discrepancies (${report.discrepancies.length})`);
      lines.push(`-------------`);

      // Group by severity
      const errors = report.discrepancies.filter(d => d.severity === 'error');
      const warnings = report.discrepancies.filter(d => d.severity === 'warning');
      const info = report.discrepancies.filter(d => d.severity === 'info');

      if (errors.length > 0) {
        lines.push('');
        lines.push(`ERRORS (${errors.length}):`);
        errors.forEach((d, i) => {
          lines.push(`${i + 1}. ${d.message}`);
          if (d.details.csvQuantity !== undefined) {
            lines.push(`   CSV Quantity: ${d.details.csvQuantity}`);
          }
          if (d.details.dbQuantity !== undefined) {
            lines.push(`   DB Quantity: ${d.details.dbQuantity}`);
          }
        });
      }

      if (warnings.length > 0) {
        lines.push('');
        lines.push(`WARNINGS (${warnings.length}):`);
        warnings.forEach((d, i) => {
          lines.push(`${i + 1}. ${d.message}`);
          if (d.details.csvQuantity !== undefined) {
            lines.push(`   CSV Quantity: ${d.details.csvQuantity}`);
          }
          if (d.details.dbQuantity !== undefined) {
            lines.push(`   DB Quantity: ${d.details.dbQuantity}`);
          }
        });
      }

      if (info.length > 0) {
        lines.push('');
        lines.push(`INFO (${info.length}):`);
        info.forEach((d, i) => {
          lines.push(`${i + 1}. ${d.message}`);
          if (d.details.legacyAssemblyGroup) {
            lines.push(`   Legacy Format: ${d.details.legacyAssemblyGroup}`);
          }
        });
      }
    }

    lines.push('');
    lines.push(`CSV Assembly Structure`);
    lines.push(`---------------------`);

    const printNode = (node: AssemblyStructure, indent: number = 0) => {
      const prefix = '  '.repeat(indent);
      lines.push(`${prefix}${node.assemblyPartNumber} (qty: ${node.quantity}) - ${node.description}`);
      node.children.forEach(child => printNode(child, indent + 1));
    };

    report.csvAssemblies.forEach(assembly => printNode(assembly));

    return lines.join('\n');
  }

  /**
   * Parse CSV line handling quoted fields
   */
  private parseCSVLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells;
  }

  /**
   * Parse number from string (handles European format)
   */
  private parseNumber(str: string): number {
    const cleaned = str.replace(/[^\d.,-]/g, '');
    const normalized = cleaned.replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 1 : num;
  }

  /**
   * Flatten assembly structure to get all parts
   */
  flattenAssembly(assembly: AssemblyStructure): string[] {
    const parts: string[] = [assembly.assemblyPartNumber];
    assembly.children.forEach(child => {
      parts.push(...this.flattenAssembly(child));
    });
    return parts;
  }

  /**
   * Get all unique part numbers from CSV assemblies
   */
  getAllPartNumbers(assemblies: AssemblyStructure[]): string[] {
    const allParts = new Set<string>();
    assemblies.forEach(assembly => {
      this.flattenAssembly(assembly).forEach(part => allParts.add(part));
    });
    return Array.from(allParts);
  }
}
