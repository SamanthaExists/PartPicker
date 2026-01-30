import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllFromTable } from '@/lib/supabasePagination';
import { parsePartListFile, type PartListMap } from '@/lib/partListParser';

interface SyncResult {
  success: boolean;
  updatedCount: number;
  notFoundCount: number;
  errors: string[];
  notFoundParts: string[];
}

export function usePartListSync() {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const syncPartList = useCallback(async (file: File): Promise<SyncResult> => {
    setSyncing(true);
    const errors: string[] = [];
    const notFoundParts: string[] = [];
    let updatedCount = 0;
    let notFoundCount = 0;

    try {
      // Parse the Part List file
      const parseResult = await parsePartListFile(file);

      if (!parseResult.success) {
        const result: SyncResult = {
          success: false,
          updatedCount: 0,
          notFoundCount: 0,
          errors: parseResult.errors,
          notFoundParts: []
        };
        setLastSyncResult(result);
        setSyncing(false);
        return result;
      }

      const partList = parseResult.partList;

      // Get all line items from database
      let lineItems: { id: string; part_number: string }[];
      try {
        lineItems = await fetchAllFromTable<{ id: string; part_number: string }>(
          'line_items',
          'id, part_number'
        );
      } catch (fetchError) {
        throw new Error(`Failed to fetch line items: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }

      if (!lineItems || lineItems.length === 0) {
        const result: SyncResult = {
          success: true,
          updatedCount: 0,
          notFoundCount: 0,
          errors: ['No line items found in database'],
          notFoundParts: []
        };
        setLastSyncResult(result);
        setSyncing(false);
        return result;
      }

      // Group line items by part number
      const partNumbersToUpdate = new Map<string, string[]>(); // part_number -> [line_item_ids]

      for (const item of lineItems) {
        const partNum = item.part_number;
        if (!partNumbersToUpdate.has(partNum)) {
          partNumbersToUpdate.set(partNum, []);
        }
        const ids = partNumbersToUpdate.get(partNum);
        if (ids) {
          ids.push(item.id);
        }
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
            updateData.location = partRecord.location;
          }
          if (partRecord.description !== null) {
            updateData.description = partRecord.description;
          }
          // Always update qty_available (even if 0)
          updateData.qty_available = partRecord.qtyAvailable;

          // Try updating with qty_on_order
          if (qtyOnOrderColumnExists) {
            const { error: updateError } = await supabase
              .from('line_items')
              .update({
                ...updateData,
                qty_on_order: partRecord.qtyOnOrder
              })
              .in('id', lineItemIds);

            if (updateError) {
              // Check if it's because column doesn't exist
              const errMsg = updateError.message.toLowerCase();
              if (errMsg.includes('qty_on_order') && (errMsg.includes('does not exist') || errMsg.includes('could not find') || errMsg.includes('schema cache'))) {
                qtyOnOrderColumnExists = false;
                // Will fall through to update without qty_on_order below
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
            const { error: updateError } = await supabase
              .from('line_items')
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

      setLastSyncResult(result);
      setSyncing(false);
      return result;

    } catch (error) {
      const result: SyncResult = {
        success: false,
        updatedCount,
        notFoundCount,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        notFoundParts
      };
      setLastSyncResult(result);
      setSyncing(false);
      return result;
    }
  }, []);

  return {
    syncPartList,
    syncing,
    lastSyncResult
  };
}
