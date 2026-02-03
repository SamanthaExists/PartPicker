import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllFromTable } from '@/lib/supabasePagination';

const API_USER_ID = '5eaaffe8-b522-45af-a78d-e59763f0d9ce';
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 500;

interface ApiProduct {
  Id: number;
  ProductId: string;
  Description: string;
  QuantityOnHand: number;
  QuantityOnOrder: number;
  InventoryLocationId: number;
}

interface SyncProgress {
  currentBatch: number;
  totalBatches: number;
  status: string;
}

interface ApiSyncResult {
  success: boolean;
  updatedCount: number;
  notFoundCount: number;
  notFoundParts: string[];
  errors: string[];
}

export function useApiSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<ApiSyncResult | null>(null);

  const syncFromApi = useCallback(async (): Promise<ApiSyncResult> => {
    setSyncing(true);
    setProgress({ currentBatch: 0, totalBatches: 0, status: 'Fetching line items...' });

    const errors: string[] = [];
    const notFoundParts: string[] = [];
    let updatedCount = 0;
    let notFoundCount = 0;

    try {
      // Fetch all line items from database
      let lineItems: { id: string; part_number: string }[];
      try {
        lineItems = await fetchAllFromTable<{ id: string; part_number: string }>(
          'line_items',
          'id, part_number'
        );
      } catch (fetchError) {
        throw new Error(
          `Failed to fetch line items: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
        );
      }

      if (!lineItems || lineItems.length === 0) {
        const result: ApiSyncResult = {
          success: true,
          updatedCount: 0,
          notFoundCount: 0,
          notFoundParts: [],
          errors: ['No line items found in database'],
        };
        setLastSyncResult(result);
        return result;
      }

      // Group line item IDs by part number
      const partNumberToIds = new Map<string, string[]>();
      for (const item of lineItems) {
        const ids = partNumberToIds.get(item.part_number) || [];
        ids.push(item.id);
        partNumberToIds.set(item.part_number, ids);
      }

      // Get unique part numbers and split into batches
      const uniquePartNumbers = Array.from(partNumberToIds.keys());
      const batches: string[][] = [];
      for (let i = 0; i < uniquePartNumbers.length; i += BATCH_SIZE) {
        batches.push(uniquePartNumbers.slice(i, i + BATCH_SIZE));
      }

      const totalBatches = batches.length;
      setProgress({ currentBatch: 0, totalBatches, status: `Processing 0 of ${totalBatches} batches...` });

      // Track if qty_on_order column exists
      let qtyOnOrderColumnExists = true;

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setProgress({
          currentBatch: batchIndex + 1,
          totalBatches,
          status: `Processing batch ${batchIndex + 1} of ${totalBatches}...`,
        });

        // Call the API
        let products: ApiProduct[];
        try {
          const response = await fetch('/api/proxy/product/searchproducts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              UserId: API_USER_ID,
              ProductIdList: batch,
            }),
          });

          if (!response.ok) {
            errors.push(`Batch ${batchIndex + 1}: API returned ${response.status} ${response.statusText}`);
            continue;
          }

          products = await response.json();
        } catch (fetchErr) {
          errors.push(
            `Batch ${batchIndex + 1}: Network error - ${fetchErr instanceof Error ? fetchErr.message : 'Unknown error'}`
          );
          continue;
        }

        // Map API response by ProductId
        const productMap = new Map<string, ApiProduct>();
        for (const product of products) {
          productMap.set(product.ProductId, product);
        }

        // Update line items for each part in this batch
        for (const partNumber of batch) {
          const product = productMap.get(partNumber);
          const lineItemIds = partNumberToIds.get(partNumber) || [];

          if (!product) {
            notFoundCount += lineItemIds.length;
            if (!notFoundParts.includes(partNumber)) {
              notFoundParts.push(partNumber);
            }
            continue;
          }

          // Build update - only qty_available, qty_on_order, and description
          // Never touch location, qty_per_unit, total_qty_needed, or picks
          const updateData: Record<string, unknown> = {
            qty_available: product.QuantityOnHand,
            description: product.Description,
          };

          let updateSucceeded = false;

          // Try updating with qty_on_order first
          if (qtyOnOrderColumnExists) {
            const { error: updateError } = await supabase
              .from('line_items')
              .update({
                ...updateData,
                qty_on_order: product.QuantityOnOrder,
              })
              .in('id', lineItemIds);

            if (updateError) {
              const errMsg = updateError.message.toLowerCase();
              if (
                errMsg.includes('qty_on_order') &&
                (errMsg.includes('does not exist') ||
                  errMsg.includes('could not find') ||
                  errMsg.includes('schema cache'))
              ) {
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
        }

        // Delay between batches to avoid overwhelming the API
        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Add warning if qty_on_order column doesn't exist
      if (!qtyOnOrderColumnExists) {
        errors.push(
          'Note: qty_on_order column not found - run the migration SQL in Settings to enable "Qty On Order" tracking.'
        );
      }

      const result: ApiSyncResult = {
        success: errors.filter((e) => !e.startsWith('Note:')).length === 0,
        updatedCount,
        notFoundCount,
        notFoundParts,
        errors,
      };

      setLastSyncResult(result);
      return result;
    } catch (error) {
      const result: ApiSyncResult = {
        success: false,
        updatedCount,
        notFoundCount,
        notFoundParts,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
      setLastSyncResult(result);
      return result;
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, []);

  return {
    syncFromApi,
    syncing,
    progress,
    lastSyncResult,
  };
}
