import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Order, OrderWithProgress, Tool, LineItem, ImportedOrder } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class OrdersService implements OnDestroy {
  private ordersSubject = new BehaviorSubject<OrderWithProgress[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  orders$ = this.ordersSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.fetchOrders();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => this.fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, () => this.fetchOrders())
      .subscribe();
  }

  async fetchOrders(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Fetch orders with tools and server-computed progress in a single query
      const { data: ordersData, error: ordersError } = await this.supabase.from('orders')
        .select(`
          *,
          tools (*),
          order_progress (total_items, picked_items, progress_percent)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithProgress: OrderWithProgress[] = (ordersData || []).map(order => {
        // order_progress is a 1-to-1 relation via order_id, Supabase returns it as an array
        const progress = (order.order_progress as { total_items: number; picked_items: number; progress_percent: number }[] | null)?.[0];
        return {
          ...order,
          tools: order.tools || [],
          total_items: progress?.total_items ?? 0,
          picked_items: progress?.picked_items ?? 0,
          progress_percent: progress?.progress_percent ?? 0,
        };
      });

      this.ordersSubject.next(ordersWithProgress);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async createOrder(order: Partial<Order>): Promise<Order | null> {
    try {
      const { data, error } = await this.supabase.from('orders')
        .insert({
          so_number: order.so_number!,
          po_number: order.po_number || null,
          customer_name: order.customer_name || null,
          order_date: order.order_date || null,
          due_date: order.due_date || null,
          status: order.status || 'active',
          notes: order.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to create order');
      return null;
    }
  }

  async importOrder(imported: ImportedOrder): Promise<Order | null> {
    try {
      // Create the order
      const { data: orderData, error: orderError } = await this.supabase.from('orders')
        .insert({
          so_number: imported.so_number,
          po_number: imported.po_number || null,
          customer_name: imported.customer_name || null,
          order_date: imported.order_date || null,
          due_date: imported.due_date || null,
          estimated_ship_date: imported.estimated_ship_date || null,
          status: 'active',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create tools
      let createdTools: Array<{ id: string; tool_number: string }> = [];
      if (imported.tools.length > 0) {
        const toolsToInsert = imported.tools.map(tool => ({
          order_id: orderData.id,
          tool_number: tool.tool_number,
          serial_number: tool.serial_number || null,
          tool_model: tool.tool_model || null,
          status: 'pending' as const,
        }));

        const { data: toolsData, error: toolsError } = await this.supabase.from('tools')
          .insert(toolsToInsert)
          .select('id, tool_number');

        if (toolsError) throw toolsError;
        createdTools = toolsData || [];
      }

      // Create line items
      if (imported.line_items.length > 0) {
        const toolIdMap = new Map<string, string>();
        for (const tool of createdTools) {
          toolIdMap.set(`temp-${tool.tool_number}`, tool.id);
        }

        const itemsToInsert = imported.line_items.map(item => {
          let toolIds: string[] | null = null;
          if (item.tool_ids && item.tool_ids.length > 0) {
            toolIds = item.tool_ids
              .map(tempId => toolIdMap.get(tempId))
              .filter((id): id is string => id !== undefined);
            if (toolIds.length === 0) toolIds = null;
          }

          return {
            order_id: orderData.id,
            part_number: item.part_number,
            description: item.description || null,
            location: item.location || null,
            qty_per_unit: item.qty_per_unit,
            total_qty_needed: item.total_qty_needed,
            tool_ids: toolIds,
            assembly_group: item.assembly_group || null,
          };
        });

        const { error: itemsError } = await this.supabase.from('line_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      await this.fetchOrders();
      return orderData;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to import order');
      return null;
    }
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('orders')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update order');
      return false;
    }
  }

  async deleteOrder(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await this.fetchOrders();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete order');
      return false;
    }
  }

  // Get a single order with its tools and line items
  async getOrder(orderId: string): Promise<{ order: Order | null; tools: Tool[]; lineItems: LineItem[] }> {
    try {
      const [orderRes, toolsRes, itemsRes] = await Promise.all([
        this.supabase.from('orders').select('*').eq('id', orderId).single(),
        this.supabase.from('tools').select('*').eq('order_id', orderId).order('tool_number'),
        this.supabase.from('line_items').select('*').eq('order_id', orderId).order('part_number'),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (toolsRes.error) throw toolsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      return {
        order: orderRes.data,
        tools: toolsRes.data || [],
        lineItems: itemsRes.data || [],
      };
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch order');
      return { order: null, tools: [], lineItems: [] };
    }
  }

  // Tool management
  async addTool(orderId: string, toolNumber: string, serialNumber?: string, toolModel?: string): Promise<Tool | null> {
    try {
      const { data, error } = await this.supabase.from('tools')
        .insert({
          order_id: orderId,
          tool_number: toolNumber,
          serial_number: serialNumber || null,
          tool_model: toolModel || null,
          status: 'pending' as const,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to add tool');
      return null;
    }
  }

  async deleteTool(toolId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('tools')
        .delete()
        .eq('id', toolId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete tool');
      return false;
    }
  }

  // Generate next tool number
  generateNextToolNumber(soNumber: string, existingTools: Tool[]): string {
    const existingSuffixes = existingTools
      .map((t) => {
        const match = t.tool_number.match(/-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const nextSuffix = existingSuffixes.length > 0 ? Math.max(...existingSuffixes) + 1 : 1;
    return `${soNumber}-${nextSuffix}`;
  }
}
