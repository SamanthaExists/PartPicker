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
      console.log('[ConsolidatedParts] Starting fetch...');

      // Fetch active orders
      const { data: ordersData, error: ordersError } = await this.supabase.from('orders')
        .select('id, so_number, order_date, tool_model')
        .eq('status', 'active');

      console.log('[ConsolidatedParts] Orders query result:', { count: ordersData?.length, error: ordersError });
      if (ordersError) throw ordersError;

      const activeOrderIds = (ordersData || []).map(o => o.id);
      const orderMap = new Map<string, { so_number: string; order_date: string | null; tool_model: string | null }>();
      for (const order of ordersData || []) {
        orderMap.set(order.id, { so_number: order.so_number, order_date: order.order_date, tool_model: order.tool_model });
      }

      console.log('[ConsolidatedParts] Active order IDs:', activeOrderIds.length);
      if (activeOrderIds.length === 0) {
        console.log('[ConsolidatedParts] No active orders found');
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

      // Fetch picks for these line items in batches (to avoid URL length limits)
      const lineItemIds = (lineItemsData || []).map(item => item.id);
      let picksData: any[] = [];

      if (lineItemIds.length > 0) {
        const BATCH_SIZE = 50; // Supabase URL length limit workaround
        const batches: string[][] = [];

        for (let i = 0; i < lineItemIds.length; i += BATCH_SIZE) {
          batches.push(lineItemIds.slice(i, i + BATCH_SIZE));
        }

        const batchResults = await Promise.all(
          batches.map(batch =>
            this.supabase.from('picks')
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

        const orderInfo = orderMap.get(item.order_id);
        if (existing) {
          existing.total_needed += item.total_qty_needed;
          existing.total_picked += pickedQty;
          existing.remaining = existing.total_needed - existing.total_picked;
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderInfo?.so_number || 'Unknown',
            order_date: orderInfo?.order_date || null,
            tool_model: orderInfo?.tool_model || null,
            needed: item.total_qty_needed,
            picked: pickedQty,
            line_item_id: item.id,
          });
        } else {
          partMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_available: item.qty_available ?? null,
            qty_on_order: item.qty_on_order ?? null,
            total_needed: item.total_qty_needed,
            total_picked: pickedQty,
            remaining: item.total_qty_needed - pickedQty,
            orders: [{
              order_id: item.order_id,
              so_number: orderInfo?.so_number || 'Unknown',
              order_date: orderInfo?.order_date || null,
              tool_model: orderInfo?.tool_model || null,
              needed: item.total_qty_needed,
              picked: pickedQty,
              line_item_id: item.id,
            }],
          });
        }
      }

      // Sort orders within each part by order_date (oldest first), fallback to SO number
      for (const part of partMap.values()) {
        part.orders.sort((a, b) => {
          // First, sort by order_date (oldest first, nulls at end)
          if (a.order_date !== null && b.order_date !== null) {
            const dateCompare = new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
            if (dateCompare !== 0) return dateCompare;
          } else if (a.order_date !== null && b.order_date === null) {
            return -1; // a has date, b doesn't - a comes first
          } else if (a.order_date === null && b.order_date !== null) {
            return 1; // b has date, a doesn't - b comes first
          }
          // Fallback: sort by SO number (lower/older SO numbers first)
          return a.so_number.localeCompare(b.so_number, undefined, { numeric: true });
        });
      }

      // Sort by part number
      const parts = Array.from(partMap.values())
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      this.partsSubject.next(parts);
      console.log('[ConsolidatedParts] Successfully loaded', parts.length, 'parts');
    } catch (err) {
      console.error('[ConsolidatedParts] Error:', err);
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
  private onOrderItemsSubject = new BehaviorSubject<ItemToOrder[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  items$ = this.itemsSubject.asObservable();
  onOrderItems$ = this.onOrderItemsSubject.asObservable();
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
      console.log('[ItemsToOrder] Starting fetch...');

      // Fetch active orders
      const { data: ordersData, error: ordersError } = await this.supabase.from('orders')
        .select('id, so_number, tool_model')
        .eq('status', 'active');

      console.log('[ItemsToOrder] Orders query result:', { count: ordersData?.length, error: ordersError });
      if (ordersError) throw ordersError;

      const activeOrderIds = (ordersData || []).map(o => o.id);
      const orderMap = new Map<string, { so_number: string; tool_model: string | null }>();
      for (const order of ordersData || []) {
        orderMap.set(order.id, { so_number: order.so_number, tool_model: order.tool_model });
      }

      if (activeOrderIds.length === 0) {
        this.itemsSubject.next([]);
        this.onOrderItemsSubject.next([]);
        return;
      }

      // Fetch all line items for active orders with pagination
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

      // Fetch picks for these line items in batches (to avoid URL length limits)
      const lineItemIds = (lineItemsData || []).map(item => item.id);
      let picksData: any[] = [];

      if (lineItemIds.length > 0) {
        const BATCH_SIZE = 50; // Supabase URL length limit workaround
        const batches: string[][] = [];

        for (let i = 0; i < lineItemIds.length; i += BATCH_SIZE) {
          batches.push(lineItemIds.slice(i, i + BATCH_SIZE));
        }

        const batchResults = await Promise.all(
          batches.map(batch =>
            this.supabase.from('picks')
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

      // Calculate picks by line item
      const picksByLineItem = new Map<string, number>();
      for (const pick of picksData) {
        const current = picksByLineItem.get(pick.line_item_id) || 0;
        picksByLineItem.set(pick.line_item_id, current + pick.qty_picked);
      }

      // Group by part number — do NOT skip items based on stock+on-order coverage
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
          // Use the first non-null qty_on_order found (should be same for same part)
          if (existing.qty_on_order === null && item.qty_on_order !== null) {
            existing.qty_on_order = item.qty_on_order;
          }
          existing.qty_to_order = Math.max(0, existing.remaining - existing.qty_available - (existing.qty_on_order ?? 0));
          const orderInfo = orderMap.get(item.order_id);
          existing.orders.push({
            order_id: item.order_id,
            so_number: orderInfo?.so_number || 'Unknown',
            tool_model: orderInfo?.tool_model || null,
            needed: item.total_qty_needed,
            picked: pickedQty,
          });
        } else {
          const qtyOnOrder = item.qty_on_order ?? 0;
          const qtyAvailable = item.qty_available || 0;
          const orderInfo = orderMap.get(item.order_id);
          itemMap.set(item.part_number, {
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_available: qtyAvailable,
            qty_on_order: item.qty_on_order ?? null,
            total_needed: item.total_qty_needed,
            total_picked: pickedQty,
            remaining: remaining,
            qty_to_order: Math.max(0, remaining - qtyAvailable - qtyOnOrder),
            orders: [{
              order_id: item.order_id,
              so_number: orderInfo?.so_number || 'Unknown',
              tool_model: orderInfo?.tool_model || null,
              needed: item.total_qty_needed,
              picked: pickedQty,
            }],
          });
        }
      }

      // Split into two lists from the grouped data
      const allGrouped = Array.from(itemMap.values());

      const needToOrder = allGrouped
        .filter(item => item.qty_to_order > 0)
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      const onOrder = allGrouped
        .filter(item => item.qty_on_order !== null && item.qty_on_order > 0)
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      this.itemsSubject.next(needToOrder);
      this.onOrderItemsSubject.next(onOrder);
      console.log('[ItemsToOrder] Successfully loaded', needToOrder.length, 'items to order,', onOrder.length, 'on order');
    } catch (err) {
      console.error('[ItemsToOrder] Error:', err);
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch items to order');
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
