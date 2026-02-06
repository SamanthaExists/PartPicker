import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SEARCH_RESULT_LIMIT, PICKS_QUERY_LIMIT } from '@/lib/constants';

export interface SearchResult {
  id: string;
  part_number: string;
  description: string | null;
  location: string | null;
  order_id: string;
  so_number: string;
  total_qty_needed: number;
  total_picked: number;
}

export function useGlobalSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const searchTerm = `%${query.trim()}%`;

      // Search line_items with order info using ilike for partial matching
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('line_items')
        .select(`
          id,
          part_number,
          description,
          location,
          total_qty_needed,
          order_id,
          orders!inner (
            id,
            so_number,
            status
          )
        `)
        .eq('orders.status', 'active')
        .or(`part_number.ilike.${searchTerm},description.ilike.${searchTerm},location.ilike.${searchTerm}`)
        .limit(SEARCH_RESULT_LIMIT);

      if (lineItemsError) throw lineItemsError;

      // Fetch picks for matching line items
      const lineItemIds = (lineItemsData || []).map(item => item.id);

      let picksByLineItem = new Map<string, number>();

      if (lineItemIds.length > 0) {
        // Supabase defaults to 1000 rows - need higher limit for accurate totals
        const { data: picksData, error: picksError } = await supabase
          .from('picks')
          .select('line_item_id, qty_picked')
          .in('line_item_id', lineItemIds)
          .limit(PICKS_QUERY_LIMIT);

        if (picksError) throw picksError;

        for (const pick of picksData || []) {
          const current = picksByLineItem.get(pick.line_item_id) || 0;
          picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
        }
      }

      // Transform results
      const searchResults: SearchResult[] = (lineItemsData || []).map(item => {
        const orderInfo = item.orders as unknown as { id: string; so_number: string; status: string };
        return {
          id: item.id,
          part_number: item.part_number,
          description: item.description,
          location: item.location,
          order_id: item.order_id,
          so_number: orderInfo.so_number,
          total_qty_needed: item.total_qty_needed,
          total_picked: picksByLineItem.get(item.id) || 0,
        };
      });

      setResults(searchResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    search,
    clearResults,
  };
}
