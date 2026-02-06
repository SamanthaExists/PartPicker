import { supabase } from './supabase';
import { SUPABASE_PAGE_SIZE } from './constants';

/**
 * Supabase has a default limit of 1000 rows per query.
 * This utility fetches all rows by paginating through the results.
 *
 * IMPORTANT: Always use this for queries that could potentially return >1000 rows.
 * This includes:
 * - line_items (you have 1000+ parts across orders)
 * - picks (grows over time)
 * - Any table that could grow large
 */

/**
 * Helper to fetch all rows from a table with a simple select.
 * Handles pagination automatically.
 *
 * @example
 * const lineItems = await fetchAllFromTable('line_items', 'id, part_number, order_id');
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllFromTable<T = any>(
  table: string,
  select: string = '*',
  options?: {
    order?: { column: string; ascending?: boolean };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter?: (query: any) => any;
  }
): Promise<T[]> {
  let allData: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select(select);

    if (options?.filter) {
      query = options.filter(query);
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true
      });
    }

    const { data, error } = await query.range(
      page * SUPABASE_PAGE_SIZE,
      (page + 1) * SUPABASE_PAGE_SIZE - 1
    );

    if (error) throw error;

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      hasMore = data.length === SUPABASE_PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allData;
}
