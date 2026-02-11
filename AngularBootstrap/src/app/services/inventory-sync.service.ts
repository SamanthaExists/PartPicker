import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface InventoryRecord {
  partNumber: string;
  location: string;
  qtyAvailable: number;
  lotId: string;
}

export interface InventoryMap {
  [partNumber: string]: {
    location: string;
    qtyAvailable: number;
    lotId: string;
  };
}

export interface SyncResult {
  success: boolean;
  updatedCount: number;
  notFoundCount: number;
  errors: string[];
  notFoundParts: string[];
}

interface ParseInventoryResult {
  success: boolean;
  inventory: InventoryMap;
  totalRecords: number;
  uniqueParts: number;
  errors: string[];
}

interface ColumnMap {
  productId: number;
  lotId: number;
  location: number;
  qtyAvailable: number;
}

@Injectable({
  providedIn: 'root'
})
export class InventorySyncService {
  private syncingSubject = new BehaviorSubject<boolean>(false);
  private lastSyncResultSubject = new BehaviorSubject<SyncResult | null>(null);

  syncing$ = this.syncingSubject.asObservable();
  lastSyncResult$ = this.lastSyncResultSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async syncInventory(file: File): Promise<SyncResult> {
    this.syncingSubject.next(true);
    const errors: string[] = [];
    const notFoundParts: string[] = [];
    let updatedCount = 0;
    let notFoundCount = 0;

    try {
      // Parse the inventory file
      const parseResult = await this.parseInventoryFile(file);

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

      const inventory = parseResult.inventory;

      // Get all unique part numbers from line_items using pagination
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

      // Group line items by part number to avoid duplicate updates
      const partNumbersToUpdate = new Map<string, string[]>();

      for (const item of lineItems) {
        const partNum = item.part_number;
        if (!partNumbersToUpdate.has(partNum)) {
          partNumbersToUpdate.set(partNum, []);
        }
        partNumbersToUpdate.get(partNum)!.push(item.id);
      }

      // Track if qty_available column exists
      let qtyAvailableColumnExists = true;

      // Update each part number's line items with inventory data
      for (const [partNumber, lineItemIds] of partNumbersToUpdate) {
        const invRecord = inventory[partNumber];

        if (invRecord) {
          let updateSucceeded = false;

          // Try updating both location and qty_available
          if (qtyAvailableColumnExists) {
            const { error: updateError } = await this.supabase.from('line_items')
              .update({
                location: invRecord.location,
                qty_available: invRecord.qtyAvailable
              })
              .in('id', lineItemIds);

            if (updateError) {
              const errMsg = updateError.message.toLowerCase();
              if (errMsg.includes('qty_available') && (errMsg.includes('does not exist') || errMsg.includes('could not find') || errMsg.includes('schema cache'))) {
                qtyAvailableColumnExists = false;
              } else {
                errors.push(`Failed to update ${partNumber}: ${updateError.message}`);
                continue;
              }
            } else {
              updateSucceeded = true;
              updatedCount += lineItemIds.length;
            }
          }

          // Fall back to just updating location if qty_available column doesn't exist
          if (!qtyAvailableColumnExists && !updateSucceeded) {
            const { error: updateError } = await this.supabase.from('line_items')
              .update({ location: invRecord.location })
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

      // Add warning if qty_available column doesn't exist
      if (!qtyAvailableColumnExists) {
        errors.push('Note: qty_available column not found - only locations were updated. Run the migration SQL in Settings to enable stock tracking.');
      }

      const result: SyncResult = {
        success: errors.length === 0,
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

  private async parseInventoryFile(file: File): Promise<ParseInventoryResult> {
    const errors: string[] = [];

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { success: false, inventory: {}, totalRecords: 0, uniqueParts: 0, errors: ['No sheets found in workbook'] };
      }

      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: ''
      });

      if (jsonData.length < 2) {
        return { success: false, inventory: {}, totalRecords: 0, uniqueParts: 0, errors: ['Sheet has no data rows'] };
      }

      // Detect column indices from header row
      const headerRow = jsonData[0] as string[];
      const columnMap = this.detectInventoryColumns(headerRow);

      if (columnMap.productId === -1) {
        return {
          success: false,
          inventory: {},
          totalRecords: 0,
          uniqueParts: 0,
          errors: ['Could not find Product Id column in inventory file']
        };
      }

      // Parse all inventory records
      const allRecords: InventoryRecord[] = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];
        if (!row || row.length === 0) continue;

        const rawPartNumber = row[columnMap.productId];
        const partNumber = rawPartNumber !== null && rawPartNumber !== undefined
          ? String(rawPartNumber).trim()
          : '';
        if (!partNumber) continue;

        const lotId = String(row[columnMap.lotId] || '');
        const location = String(row[columnMap.location] || '').trim();
        const qtyAvailable = this.parseNumber(row[columnMap.qtyAvailable]);

        // Skip records with no location or "AWAITING INSPECTION" type locations
        const skipLocations = ['awaiting inspection', 'receiving', 'qa', 'quarantine'];
        if (!location || skipLocations.some(skip => location.toLowerCase().includes(skip))) {
          continue;
        }

        allRecords.push({
          partNumber,
          location,
          qtyAvailable,
          lotId
        });
      }

      // Group by part number and keep only the newest lot (highest lotId)
      const inventory: InventoryMap = {};

      for (const record of allRecords) {
        const existing = inventory[record.partNumber];

        if (!existing || record.lotId > existing.lotId) {
          inventory[record.partNumber] = {
            location: record.location,
            qtyAvailable: record.qtyAvailable,
            lotId: record.lotId
          };
        }
      }

      return {
        success: true,
        inventory,
        totalRecords: allRecords.length,
        uniqueParts: Object.keys(inventory).length,
        errors
      };

    } catch (error) {
      return {
        success: false,
        inventory: {},
        totalRecords: 0,
        uniqueParts: 0,
        errors: [`Failed to parse inventory file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private detectInventoryColumns(headerRow: string[]): ColumnMap {
    const map: ColumnMap = {
      productId: -1,
      lotId: -1,
      location: -1,
      qtyAvailable: -1
    };

    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();

      if (header.includes('product') && header.includes('id')) {
        map.productId = i;
      } else if (header === 'product id' || header === 'productid' || header === 'part number' || header === 'part_number') {
        map.productId = i;
      }

      if (header.includes('lot') && header.includes('id')) {
        map.lotId = i;
      } else if (header === 'lot id' || header === 'lotid') {
        map.lotId = i;
      }

      if (header === 'location' || header === 'loc' || header === 'bin') {
        map.location = i;
      }

      if (header.includes('qty') && header.includes('available')) {
        map.qtyAvailable = i;
      } else if (header === 'qty available' || header === 'qtyavailable' || header === 'available') {
        map.qtyAvailable = i;
      }
    }

    return map;
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
