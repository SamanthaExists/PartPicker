import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

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

@Injectable({
  providedIn: 'root'
})
export class GlobalSearchService {
  private resultsSubject = new BehaviorSubject<SearchResult[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  results$ = this.resultsSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async search(query: string): Promise<void> {
    if (!query || query.trim().length < 2) {
      this.resultsSubject.next([]);
      return;
    }

    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const searchTerm = `%${query.trim()}%`;

      // Search line_items with order info using ilike for partial matching
      const { data: lineItemsData, error: lineItemsError } = await this.supabase.from('line_items')
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
        .limit(20);

      if (lineItemsError) throw lineItemsError;

      // Fetch picks for matching line items
      const lineItemIds = (lineItemsData || []).map(item => item.id);

      const picksByLineItem = new Map<string, number>();

      if (lineItemIds.length > 0) {
        const { data: picksData, error: picksError } = await this.supabase.from('picks')
          .select('line_item_id, qty_picked')
          .in('line_item_id', lineItemIds);

        if (picksError) throw picksError;

        for (const pick of picksData || []) {
          const current = picksByLineItem.get(pick.line_item_id) || 0;
          picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
        }
      }

      // Transform results
      const searchResults: SearchResult[] = (lineItemsData || []).map(item => {
        const orderInfo = item.orders as any;
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

      this.resultsSubject.next(searchResults);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Search failed');
      this.resultsSubject.next([]);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  clearResults(): void {
    this.resultsSubject.next([]);
    this.errorSubject.next(null);
  }
}
