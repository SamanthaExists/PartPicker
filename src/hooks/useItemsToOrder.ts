import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ItemToOrder } from '@/types';

export function useItemsToOrder() {
  const [items, setItems] = useState<ItemToOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all line items from active orders (we'll filter by insufficient stock after calculating picks)
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('line_items')
        .select(`
          id,
          part_number,
          description,
          location,
          qty_available,
          total_qty_needed,
          order_id,
          orders!inner (
            id,
            so_number,
            status
          )
        `)
        .eq('orders.status', 'active');

      if (lineItemsError) throw lineItemsError;

      // Fetch all picks for these line items
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select('line_item_id, qty_picked');

      if (picksError) throw picksError;

      // Calculate picks per line item
      const picksByLineItem = new Map<string, number>();
      for (const pick of picksData || []) {
        const current = picksByLineItem.get(pick.line_item_id) || 0;
        picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
      }

      // Group by part number
      const itemsMap = new Map<string, ItemToOrder>();

      for (const item of lineItemsData || []) {
        const orderInfo = item.orders as any;
        const picked = picksByLineItem.get(item.id) || 0;
        const remaining = item.total_qty_needed - picked;
        const qtyAvailable = item.qty_available ?? 0;

        // Skip items that are fully picked
        if (remaining <= 0) continue;

        // Skip items where we have enough stock to cover remaining need
        if (qtyAvailable >= remaining) continue;

        const existing = itemsMap.get(item.part_number);

        if (existing) {
          existing.total_needed += item.total_qty_needed;
          existing.total_picked += picked;
          existing.remaining = existing.total_needed - existing.total_picked;
          existing.qty_to_order = Math.max(0, existing.remaining - existing.qty_available);
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderInfo.so_number,
            needed: item.total_qty_needed,
            picked: picked,
          });
        } else {
          const newRemaining = remaining;
          const newQtyAvailable = item.qty_available ?? 0;
          itemsMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_available: newQtyAvailable,
            total_needed: item.total_qty_needed,
            total_picked: picked,
            remaining: newRemaining,
            qty_to_order: Math.max(0, newRemaining - newQtyAvailable),
            orders: [{
              order_id: item.order_id,
              so_number: orderInfo.so_number,
              needed: item.total_qty_needed,
              picked: picked,
            }],
          });
        }
      }

      // Convert to array and sort by part number
      const itemsToOrder = Array.from(itemsMap.values())
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      setItems(itemsToOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items to order');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('items-to-order')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => fetchItems()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'line_items' },
        () => fetchItems()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchItems()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchItems]);

  return {
    items,
    loading,
    error,
    refresh: fetchItems,
  };
}
