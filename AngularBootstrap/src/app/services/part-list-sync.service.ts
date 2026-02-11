import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface PartListRecord {
  partNumber: string;
  location: string | null;
  qtyAvailable: number;
  qtyOnOrder: number;
  description: string | null;
}

export interface PartListMap {
  [partNumber: string]: PartListRecord;
}

export interface SyncResult {
  success: boolean;
  updatedCount: number;
  notFoundCount: number;
  errors: string[];
  notFoundParts: string[];
}

interface ParsePartListResult {
  success: boolean;
  partList: PartListMap;
  totalRecords: number;
  uniqueParts: number;
  errors: string[];
}

interface ColumnMap {
  productId: number;
  location: number;
  qtyAvailable: number;
  qtyOnOrder: number;
  description: number;
}

@Injectable({
  providedIn: 'root'
})
export class PartListSyncService {
  private syncingSubject = new BehaviorSubject<boolean>(false);
  private lastSyncResultSubject = new BehaviorSubject<SyncResult | null>(null);

  syncing$ = this.syncingSubject.asObservable();
  lastSyncResult$ = this.lastSyncResultSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async syncPartList(file: File): Promise<SyncResult> {
    this.syncingSubject.next(true);
    const errors: string[] = [];
    const notFoundParts: string[] = [];
    let updatedCount = 0;
    let notFoundCount = 0;

    try {
      // Parse the Part List file
      const parseResult = await this.parsePartListFile(file);

      if (!parseResult.success) {
        const result: SyncResult = {
          success: false,
          updatedCount: 0,
          notFoundCount: 0,
          errors: parseResult.errors,
          notFoundParts: []
        };
        this.lastSyncResultSubject.next(result);
        this.syncingSubject.next(false);
        return result;
      }

      const partList = parseResult.partList;

      // Get all line items from database using pagination
      let lineItems: { id: string; part_number: string }[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await this.supabase.from('line_items')
          .select('id, part_number')
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(`Failed to fetch line items: ${error.message}`);

        if (data && data.length > 0) {
          lineItems.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      if (!lineItems || lineItems.length === 0) {
        const result: SyncResult = {
          success: true,
          updatedCount: 0,
          notFoundCount: 0,
          errors: ['No line items found in database'],
          notFoundParts: []
        };
        this.lastSyncResultSubject.next(result);
        this.syncingSubject.next(false);
        return result;
      }

      // Group line items by part number
      const partNumbersToUpdate = new Map<string, string[]>();

      for (const item of lineItems) {
        const partNum = item.part_number;
        if (!partNumbersToUpdate.has(partNum)) {
          partNumbersToUpdate.set(partNum, []);
        }
        partNumbersToUpdate.get(partNum)!.push(item.id);
      }

      // Track if qty_on_order column exists
      let qtyOnOrderColumnExists = true;

      // Update each part number's line items with Part List data
      for (const [partNumber, lineItemIds] of partNumbersToUpdate) {
        const partRecord = partList[partNumber];

        if (partRecord) {
          let updateSucceeded = false;

          // Build update object - only include non-null values
          const updateData: Record<string, unknown> = {};

          if (partRecord.location !== null) {
            updateData['location'] = partRecord.location;
          }
          if (partRecord.description !== null) {
            updateData['description'] = partRecord.description;
          }
          // Always update qty_available (even if 0)
          updateData['qty_available'] = partRecord.qtyAvailable;

          // Try updating with qty_on_order
          if (qtyOnOrderColumnExists) {
            const { error: updateError } = await this.supabase.from('line_items')
              .update({
                ...updateData,
                qty_on_order: partRecord.qtyOnOrder
              })
              .in('id', lineItemIds);

            if (updateError) {
              const errMsg = updateError.message.toLowerCase();
              if (errMsg.includes('qty_on_order') && (errMsg.includes('does not exist') || errMsg.includes('could not find') || errMsg.includes('schema cache'))) {
                qtyOnOrderColumnExists = false;
              } else {
                errors.push(`Failed to update ${partNumber}: ${updateError.message}`);
                continue;
              }
            } else {
              updateSucceeded = true;
              updatedCount += lineItemIds.length;
            }
          }

          // Fall back to updating without qty_on_order if column doesn't exist
          if (!qtyOnOrderColumnExists && !updateSucceeded) {
            const { error: updateError } = await this.supabase.from('line_items')
              .update(updateData)
              .in('id', lineItemIds);

            if (updateError) {
              errors.push(`Failed to update ${partNumber}: ${updateError.message}`);
            } else {
              updatedCount += lineItemIds.length;
            }
          }
        } else {
          notFoundCount += lineItemIds.length;
          if (!notFoundParts.includes(partNumber)) {
            notFoundParts.push(partNumber);
          }
        }
      }

      // Add warning if qty_on_order column doesn't exist
      if (!qtyOnOrderColumnExists) {
        errors.push('Note: qty_on_order column not found - run the migration SQL in Settings to enable "Qty On Order" tracking.');
      }

      const result: SyncResult = {
        success: errors.filter(e => !e.startsWith('Note:')).length === 0,
        updatedCount,
        notFoundCount,
        errors,
        notFoundParts
      };

      this.lastSyncResultSubject.next(result);
      this.syncingSubject.next(false);
      return result;

    } catch (error) {
      const result: SyncResult = {
        success: false,
        updatedCount,
        notFoundCount,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        notFoundParts
      };
      this.lastSyncResultSubject.next(result);
      this.syncingSubject.next(false);
      return result;
    }
  }

  private async parsePartListFile(file: File): Promise<ParsePartListResult> {
    const errors: string[] = [];

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { success: false, partList: {}, totalRecords: 0, uniqueParts: 0, errors: ['No sheets found in workbook'] };
      }

      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: ''
      });

      if (jsonData.length < 2) {
        return { success: false, partList: {}, totalRecords: 0, uniqueParts: 0, errors: ['Sheet has no data rows'] };
      }

      // Detect column indices from header row
      const headerRow = jsonData[0] as string[];
      const columnMap = this.detectPartListColumns(headerRow);

      if (columnMap.productId === -1) {
        return {
          success: false,
          partList: {},
          totalRecords: 0,
          uniqueParts: 0,
          errors: ['Could not find Product Id column in Part List file. Expected column names: "Product Id", "Part Number"']
        };
      }

      // Parse all records
      const partList: PartListMap = {};
      let totalRecords = 0;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];
        if (!row || row.length === 0) continue;

        const rawPartNumber = row[columnMap.productId];
        const partNumber = rawPartNumber !== null && rawPartNumber !== undefined
          ? String(rawPartNumber).trim()
          : '';
        if (!partNumber) continue;

        const location = columnMap.location !== -1
          ? this.normalizeString(row[columnMap.location])
          : null;
        const qtyAvailable = this.parseNumber(row[columnMap.qtyAvailable]);
        const qtyOnOrder = this.parseNumber(row[columnMap.qtyOnOrder]);
        const description = columnMap.description !== -1
          ? this.normalizeString(row[columnMap.description])
          : null;

        totalRecords++;

        // Store in map (last occurrence wins if duplicates exist)
        partList[partNumber] = {
          partNumber,
          location,
          qtyAvailable,
          qtyOnOrder,
          description
        };
      }

      return {
        success: true,
        partList,
        totalRecords,
        uniqueParts: Object.keys(partList).length,
        errors
      };

    } catch (error) {
      return {
        success: false,
        partList: {},
        totalRecords: 0,
        uniqueParts: 0,
        errors: [`Failed to parse Part List file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private detectPartListColumns(headerRow: string[]): ColumnMap {
    const map: ColumnMap = {
      productId: -1,
      location: -1,
      qtyAvailable: -1,
      qtyOnOrder: -1,
      description: -1
    };

    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();

      // Product Id / Part Number
      if (header.includes('product') && header.includes('id')) {
        map.productId = i;
      } else if (header === 'product id' || header === 'productid' || header === 'part number' || header === 'part_number' || header === 'partnumber') {
        map.productId = i;
      }

      // Location(s)
      if (header === 'location' || header === 'locations' || header === 'location(s)' || header === 'loc' || header === 'bin') {
        map.location = i;
      }

      // Qty Available
      if (header.includes('qty') && header.includes('available')) {
        map.qtyAvailable = i;
      } else if (header === 'qty available' || header === 'qtyavailable' || header === 'available' || header === 'qty avail') {
        map.qtyAvailable = i;
      }

      // Qty On Order
      if (header.includes('qty') && header.includes('order')) {
        map.qtyOnOrder = i;
      } else if (header === 'qty on order' || header === 'qtyonorder' || header === 'on order' || header === 'qty ordered') {
        map.qtyOnOrder = i;
      }

      // Description
      if (header === 'description' || header === 'desc' || header === 'part description') {
        map.description = i;
      }
    }

    return map;
  }

  private normalizeString(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const str = String(value).trim();
    return str === '' ? null : str;
  }

  private parseNumber(value: unknown): number {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^\d.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : Math.max(0, Math.round(num));
    }
    return 0;
  }
}
