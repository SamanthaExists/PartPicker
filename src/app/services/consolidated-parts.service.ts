import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ConsolidatedPart, ItemToOrder } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ConsolidatedPartsService implements OnDestroy {
  private partsSubject = new BehaviorSubject<ConsolidatedPart[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  parts$ = this.partsSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.fetchParts();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  refresh(): void {
    this.fetchParts();
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('consolidated-parts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_items' }, () => this.fetchParts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, () => this.fetchParts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => this.fetchParts())
      .subscribe();
  }

  async fetchParts(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Fetch active orders
      const { data: ordersData, error: ordersError } = await this.supabase.from('orders')
        .select('id, so_number')
        .eq('status', 'active');

      if (ordersError) throw ordersError;

      const activeOrderIds = (ordersData || []).map(o => o.id);
      const orderMap = new Map<string, string>();
      for (const order of ordersData || []) {
        orderMap.set(order.id, order.so_number);
      }

      if (activeOrderIds.length === 0) {
        this.partsSubject.next([]);
        return;
      }

      // Fetch line items for active orders with pagination
      let lineItemsData: any[] = [];
      {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: lineItemsError } = await this.supabase.from('line_items')
            .select('*')
            .in('order_id', activeOrderIds)
            .range(offset, offset + pageSize - 1);

          if (lineItemsError) throw lineItemsError;

          if (data && data.length > 0) {
            lineItemsData.push(...data);
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      // Fetch picks for these line items with pagination
      const lineItemIds = (lineItemsData || []).map(item => item.id);
      let picksData: any[] = [];

      if (lineItemIds.length > 0) {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: picksError } = await this.supabase.from('picks')
            .select('line_item_id, qty_picked')
            .in('line_item_id', lineItemIds)
            .range(offset, offset + pageSize - 1);

          if (picksError) throw picksError;

          if (data && data.length > 0) {
            picksData.push(...data);
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      // Calculate picks by line item
      const picksByLineItem = new Map<string, number>();
      for (const pick of picksData) {
        const current = picksByLineItem.get(pick.line_item_id) || 0;
        picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
      }

      // Group by part number
      const partMap = new Map<string, ConsolidatedPart>();

      for (const item of lineItemsData || []) {
        const pickedQty = picksByLineItem.get(item.id) || 0;
        const existing = partMap.get(item.part_number);

        if (existing) {
          existing.total_needed += item.total_qty_needed;
          existing.total_picked += pickedQty;
          existing.remaining = existing.total_needed - existing.total_picked;
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderMap.get(item.order_id) || 'Unknown',
            needed: item.total_qty_needed,
            picked: pickedQty,
            line_item_id: item.id,
          });
        } else {
          partMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            total_needed: item.total_qty_needed,
            total_picked: pickedQty,
            remaining: item.total_qty_needed - pickedQty,
            orders: [{
              order_id: item.order_id,
              so_number: orderMap.get(item.order_id) || 'Unknown',
              needed: item.total_qty_needed,
              picked: pickedQty,
              line_item_id: item.id,
            }],
          });
        }
      }

      // Sort by part number
      const parts = Array.from(partMap.values())
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      this.partsSubject.next(parts);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch parts');
    } finally {
      this.loadingSubject.next(false);
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class ItemsToOrderService implements OnDestroy {
  private itemsSubject = new BehaviorSubject<ItemToOrder[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  items$ = this.itemsSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.fetchItems();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('items-to-order')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_items' }, () => this.fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, () => this.fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => this.fetchItems())
      .subscribe();
  }

  async fetchItems(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Fetch active orders
      const { data: ordersData, error: ordersError } = await this.supabase.from('orders')
        .select('id, so_number')
        .eq('status', 'active');

      if (ordersError) throw ordersError;

      const activeOrderIds = (ordersData || []).map(o => o.id);
      const orderMap = new Map<string, string>();
      for (const order of ordersData || []) {
        orderMap.set(order.id, order.so_number);
      }

      if (activeOrderIds.length === 0) {
        this.itemsSubject.next([]);
        return;
      }

      // Fetch line items with qty_available = 0 for active orders with pagination
      let lineItemsData: any[] = [];
      {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: lineItemsError } = await this.supabase.from('line_items')
            .select('*')
            .in('order_id', activeOrderIds)
            .eq('qty_available', 0)
            .range(offset, offset + pageSize - 1);

          if (lineItemsError) throw lineItemsError;

          if (data && data.length > 0) {
            lineItemsData.push(...data);
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      // Fetch picks for these line items with pagination
      const lineItemIds = (lineItemsData || []).map(item => item.id);
      let picksData: any[] = [];

      if (lineItemIds.length > 0) {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: picksError } = await this.supabase.from('picks')
            .select('line_item_id, qty_picked')
            .in('line_item_id', lineItemIds)
            .range(offset, offset + pageSize - 1);

          if (picksError) throw picksError;

          if (data && data.length > 0) {
            picksData.push(...data);
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      // Calculate picks by line item
      const picksByLineItem = new Map<string, number>();
      for (const pick of picksData) {
        const current = picksByLineItem.get(pick.line_item_id) || 0;
        picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
      }

      // Group by part number
      const itemMap = new Map<string, ItemToOrder>();

      for (const item of lineItemsData || []) {
        const pickedQty = picksByLineItem.get(item.id) || 0;
        const remaining = item.total_qty_needed - pickedQty;

        // Only include if there's still quantity remaining
        if (remaining <= 0) continue;

        const existing = itemMap.get(item.part_number);

        if (existing) {
          existing.total_needed += item.total_qty_needed;
          existing.total_picked += pickedQty;
          existing.remaining = existing.total_needed - existing.total_picked;
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderMap.get(item.order_id) || 'Unknown',
            needed: item.total_qty_needed,
            picked: pickedQty,
          });
        } else {
          itemMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_available: item.qty_available || 0,
            total_needed: item.total_qty_needed,
            total_picked: pickedQty,
            remaining: remaining,
            orders: [{
              order_id: item.order_id,
              so_number: orderMap.get(item.order_id) || 'Unknown',
              needed: item.total_qty_needed,
              picked: pickedQty,
            }],
          });
        }
      }

      // Sort by part number
      const items = Array.from(itemMap.values())
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      this.itemsSubject.next(items);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch items to order');
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
