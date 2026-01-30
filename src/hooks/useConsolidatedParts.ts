import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ConsolidatedPart } from '@/types';

export type OrderStatusFilter = 'all' | 'active' | 'complete';

export function useConsolidatedParts(statusFilter: OrderStatusFilter = 'all') {
  const [parts, setParts] = useState<ConsolidatedPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all line items with pagination to avoid Supabase's 1000 row default limit
      const PAGE_SIZE = 1000;
      let allLineItems: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        // Build query based on status filter
        let query = supabase
          .from('line_items')
          .select(`
            id,
            part_number,
            description,
            location,
            qty_available,
            qty_on_order,
            total_qty_needed,
            order_id,
            orders!inner (
              id,
              so_number,
              status
            )
          `)
          .neq('orders.status', 'cancelled') // Always exclude cancelled orders
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        // Apply additional status filter if not 'all'
        if (statusFilter === 'active') {
          query = query.eq('orders.status', 'active');
        } else if (statusFilter === 'complete') {
          query = query.eq('orders.status', 'complete');
        }

        const { data: pageData, error: pageError } = await query;

        if (pageError) throw pageError;

        if (pageData && pageData.length > 0) {
          allLineItems = allLineItems.concat(pageData);
          hasMore = pageData.length === PAGE_SIZE;
          page++;
        } else {
          hasMore = false;
        }
      }

      const lineItemsData = allLineItems;

      // Extract line item IDs to filter picks server-side
      const lineItemIds = (lineItemsData || []).map(item => item.id);

      // Fetch picks only for the relevant line items (server-side filtering)
      // Batch the requests to avoid URL length limits
      let picksData: { line_item_id: string; qty_picked: number }[] = [];
      if (lineItemIds.length > 0) {
        const BATCH_SIZE = 50; // Supabase URL length limit workaround
        const batches: string[][] = [];

        for (let i = 0; i < lineItemIds.length; i += BATCH_SIZE) {
          batches.push(lineItemIds.slice(i, i + BATCH_SIZE));
        }

        const batchResults = await Promise.all(
          batches.map(batch =>
            supabase
              .from('picks')
              .select('line_item_id, qty_picked')
              .in('line_item_id', batch)
          )
        );

        for (const result of batchResults) {
          if (result.error) throw result.error;
          if (result.data) {
            picksData.push(...result.data);
          }
        }
      }

      // Calculate picks per line item
      const picksByLineItem = new Map<string, number>();
      for (const pick of picksData || []) {
        const current = picksByLineItem.get(pick.line_item_id) || 0;
        picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
      }

      // Group by part number
      const partsMap = new Map<string, ConsolidatedPart>();

      for (const item of lineItemsData || []) {
        const orderInfo = item.orders as any;
        const picked = picksByLineItem.get(item.id) || 0;

        const existing = partsMap.get(item.part_number);

        if (existing) {
          existing.total_needed += item.total_qty_needed;
          existing.total_picked += picked;
          existing.remaining = existing.total_needed - existing.total_picked;
          // Use the first non-null qty_available found (should be same for same part)
          if (existing.qty_available === null && item.qty_available !== null) {
            existing.qty_available = item.qty_available;
          }
          // Use the first non-null qty_on_order found (should be same for same part)
          if (existing.qty_on_order === null && item.qty_on_order !== null) {
            existing.qty_on_order = item.qty_on_order;
          }
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderInfo.so_number,
            needed: item.total_qty_needed,
            picked: picked,
            line_item_id: item.id,
          });
        } else {
          partsMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_available: item.qty_available ?? null,
            qty_on_order: item.qty_on_order ?? null,
            total_needed: item.total_qty_needed,
            total_picked: picked,
            remaining: item.total_qty_needed - picked,
            orders: [{
              order_id: item.order_id,
              so_number: orderInfo.so_number,
              needed: item.total_qty_needed,
              picked: picked,
              line_item_id: item.id,
            }],
          });
        }
      }

      // Convert to array and sort by part number
      const consolidatedParts = Array.from(partsMap.values())
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      setParts(consolidatedParts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch consolidated parts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchParts();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('consolidated-parts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => fetchParts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'line_items' },
        () => fetchParts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchParts()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchParts]);

  return {
    parts,
    loading,
    error,
    refresh: fetchParts,
  };
}
