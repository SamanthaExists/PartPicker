import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Pick, LineItemWithPicks, RecentActivity } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class PicksService implements OnDestroy {
  private picksSubject = new BehaviorSubject<Pick[]>([]);
  private lineItemsWithPicksSubject = new BehaviorSubject<LineItemWithPicks[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;
  private currentOrderId: string | null = null;

  picks$ = this.picksSubject.asObservable();
  lineItemsWithPicks$ = this.lineItemsWithPicksSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async loadPicksForOrder(orderId: string): Promise<void> {
    this.cleanup();
    this.currentOrderId = orderId;

    await this.fetchPicks(orderId);
    this.setupRealtimeSubscription(orderId);
  }

  private setupRealtimeSubscription(orderId: string): void {
    this.subscription = this.supabase.channel(`picks-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, () => {
        if (this.currentOrderId) {
          this.fetchPicks(this.currentOrderId);
        }
      })
      .subscribe();
  }

  private async fetchPicks(orderId: string): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Fetch line items for this order
      const { data: lineItemsData, error: lineItemsError } = await this.supabase.from('line_items')
        .select('*')
        .eq('order_id', orderId)
        .order('part_number');

      if (lineItemsError) throw lineItemsError;

      const lineItemIds = (lineItemsData || []).map(item => item.id);

      let picksData: Pick[] = [];
      if (lineItemIds.length > 0) {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: picksError } = await this.supabase.from('picks')
            .select('*')
            .in('line_item_id', lineItemIds)
            .order('picked_at', { ascending: false })
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

      this.picksSubject.next(picksData);

      // Group picks by line item
      const picksByLineItem = new Map<string, Pick[]>();
      for (const pick of picksData) {
        const existing = picksByLineItem.get(pick.line_item_id) || [];
        existing.push(pick);
        picksByLineItem.set(pick.line_item_id, existing);
      }

      // Create line items with picks
      const itemsWithPicks: LineItemWithPicks[] = (lineItemsData || []).map(item => {
        const itemPicks = picksByLineItem.get(item.id) || [];
        const totalPicked = itemPicks.reduce((sum, p) => sum + p.qty_picked, 0);
        return {
          ...item,
          picks: itemPicks,
          total_picked: totalPicked,
          remaining: Math.max(0, item.total_qty_needed - totalPicked),
        };
      });

      this.lineItemsWithPicksSubject.next(itemsWithPicks);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch picks');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async recordPick(
    lineItemId: string,
    toolId: string,
    qtyPicked: number,
    pickedBy?: string,
    notes?: string
  ): Promise<(Pick & { overPickWarning?: string }) | null> {
    try {
      // Check current state before picking to detect concurrent picks
      const { data: lineItem } = await this.supabase.from('line_items')
        .select('total_qty_needed')
        .eq('id', lineItemId)
        .single();

      const { data: existingPicks } = await this.supabase.from('picks')
        .select('qty_picked')
        .eq('line_item_id', lineItemId);

      const currentTotal = (existingPicks || []).reduce((sum: number, p: any) => sum + p.qty_picked, 0);
      const newTotal = currentTotal + qtyPicked;
      const needed = lineItem?.total_qty_needed || 0;

      // Record the pick
      const { data, error } = await this.supabase.from('picks')
        .insert({
          line_item_id: lineItemId,
          tool_id: toolId,
          qty_picked: qtyPicked,
          picked_by: pickedBy || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add warning if this pick causes over-picking
      if (newTotal > needed) {
        return {
          ...data,
          overPickWarning: `Over-picked! ${newTotal} picked but only ${needed} needed. Someone may have picked this item at the same time.`,
        };
      }

      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to record pick');
      return null;
    }
  }

  async undoPick(pickId: string, undoneBy?: string): Promise<boolean> {
    try {
      // Look up pick from local state
      const picks = this.picksSubject.getValue();
      const pick = picks.find(p => p.id === pickId);
      if (!pick) {
        throw new Error('Pick not found');
      }

      // Look up line item from local state for part_number and order_id
      const lineItemsWithPicks = this.lineItemsWithPicksSubject.getValue();
      const lineItem = lineItemsWithPicks.find(li => li.id === pick.line_item_id);

      // Look up tool info and order SO number from Supabase
      const { data: toolData } = await this.supabase.from('tools')
        .select('tool_number, order_id')
        .eq('id', pick.tool_id)
        .single();

      let soNumber = '';
      let orderIdForUndo = lineItem?.order_id || '';
      if (toolData) {
        orderIdForUndo = orderIdForUndo || toolData.order_id;
        const { data: orderData } = await this.supabase.from('orders')
          .select('so_number')
          .eq('id', toolData.order_id)
          .single();
        soNumber = orderData?.so_number || '';
      }

      // Insert audit snapshot into pick_undos BEFORE deleting
      const { error: auditError } = await this.supabase.from('pick_undos')
        .insert({
          original_pick_id: pick.id,
          line_item_id: pick.line_item_id,
          tool_id: pick.tool_id,
          qty_picked: pick.qty_picked,
          picked_by: pick.picked_by,
          notes: pick.notes,
          picked_at: pick.picked_at,
          part_number: lineItem?.part_number || '',
          tool_number: toolData?.tool_number || '',
          so_number: soNumber,
          order_id: orderIdForUndo,
          undone_by: undoneBy || 'Unknown',
        });

      if (auditError) throw auditError;

      // Now delete the pick
      const { error } = await this.supabase.from('picks')
        .delete()
        .eq('id', pickId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to undo pick');
      return false;
    }
  }

  // Get picks for a specific tool
  getPicksForTool(toolId: string): Map<string, number> {
    const picks = this.picksSubject.getValue();
    const result = new Map<string, number>();
    for (const pick of picks) {
      if (pick.tool_id === toolId) {
        const current = result.get(pick.line_item_id) || 0;
        result.set(pick.line_item_id, current + pick.qty_picked);
      }
    }
    return result;
  }

  // Get pick history for a specific line item and tool
  getPickHistory(lineItemId: string, toolId: string): Pick[] {
    const picks = this.picksSubject.getValue();
    return picks
      .filter(pick => pick.line_item_id === lineItemId && pick.tool_id === toolId)
      .sort((a, b) => new Date(b.picked_at).getTime() - new Date(a.picked_at).getTime());
  }

  // Get the most recent pick
  getLastPick(lineItemId: string, toolId: string): Pick | null {
    const history = this.getPickHistory(lineItemId, toolId);
    return history.length > 0 ? history[0] : null;
  }

  // Get picks for all tools
  getPicksForAllTools(): Map<string, Map<string, number>> {
    const picks = this.picksSubject.getValue();
    const result = new Map<string, Map<string, number>>();
    for (const pick of picks) {
      if (!result.has(pick.tool_id)) {
        result.set(pick.tool_id, new Map());
      }
      const toolMap = result.get(pick.tool_id)!;
      const current = toolMap.get(pick.line_item_id) || 0;
      toolMap.set(pick.line_item_id, current + pick.qty_picked);
    }
    return result;
  }

  // Record pick for a line item (finds first tool for the order)
  async recordPickForLineItem(
    lineItemId: string,
    qtyPicked: number,
    pickedBy?: string,
    notes?: string
  ): Promise<Pick | null> {
    try {
      // First get the line item to find its order_id
      const { data: lineItem, error: lineItemError } = await this.supabase.from('line_items')
        .select('order_id')
        .eq('id', lineItemId)
        .single();

      if (lineItemError || !lineItem) {
        throw new Error('Line item not found');
      }

      // Get the first tool for this order
      const { data: tools, error: toolsError } = await this.supabase.from('tools')
        .select('id')
        .eq('order_id', lineItem.order_id)
        .order('tool_number')
        .limit(1);

      if (toolsError || !tools || tools.length === 0) {
        throw new Error('No tools found for order');
      }

      const toolId = tools[0].id;

      // Record the pick
      return this.recordPick(lineItemId, toolId, qtyPicked, pickedBy, notes);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to record pick');
      return null;
    }
  }

  // Batch update allocations
  async batchUpdateAllocations(
    lineItemId: string,
    newAllocations: Map<string, number>,
    pickedBy?: string,
    notes?: string
  ): Promise<boolean> {
    try {
      const allToolPicks = this.getPicksForAllTools();

      for (const [toolId, targetQty] of newAllocations) {
        const toolMap = allToolPicks.get(toolId);
        const currentQty = toolMap?.get(lineItemId) || 0;
        const delta = targetQty - currentQty;

        if (delta > 0) {
          const { error } = await this.supabase.from('picks')
            .insert({
              line_item_id: lineItemId,
              tool_id: toolId,
              qty_picked: delta,
              picked_by: pickedBy || null,
              notes: notes || null,
            });

          if (error) throw error;
        } else if (delta < 0) {
          const pickHistory = this.getPickHistory(lineItemId, toolId);
          let qtyToRemove = Math.abs(delta);

          for (const pick of pickHistory) {
            if (qtyToRemove <= 0) break;

            if (pick.qty_picked <= qtyToRemove) {
              const { error } = await this.supabase.from('picks')
                .delete()
                .eq('id', pick.id);

              if (error) throw error;
              qtyToRemove -= pick.qty_picked;
            } else {
              const newQty = pick.qty_picked - qtyToRemove;

              const { error: deleteError } = await this.supabase.from('picks')
                .delete()
                .eq('id', pick.id);

              if (deleteError) throw deleteError;

              const { error: insertError } = await this.supabase.from('picks')
                .insert({
                  line_item_id: lineItemId,
                  tool_id: toolId,
                  qty_picked: newQty,
                  picked_by: pick.picked_by,
                  notes: pick.notes,
                });

              if (insertError) throw insertError;
              qtyToRemove = 0;
            }
          }
        }
      }

      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update allocations');
      return false;
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class RecentActivityService implements OnDestroy {
  private activitiesSubject = new BehaviorSubject<RecentActivity[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private subscription: RealtimeChannel | null = null;

  activities$ = this.activitiesSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.fetchActivity();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'picks' }, () => this.fetchActivity())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pick_undos' }, () => this.fetchActivity())
      .subscribe();
  }

  async fetchActivity(): Promise<void> {
    try {
      this.loadingSubject.next(true);

      const { data: picksData, error: picksError } = await this.supabase.from('picks')
        .select(`
          id,
          qty_picked,
          picked_by,
          picked_at,
          line_items!inner (
            part_number,
            order_id,
            orders!inner (
              so_number
            )
          )
        `)
        .order('picked_at', { ascending: false })
        .limit(20);

      if (picksError) {
        console.error('Error fetching activity:', picksError);
      }

      const pickActivities: RecentActivity[] = (picksData || []).map((pick: any) => ({
        id: pick.id,
        type: 'pick' as const,
        message: `Picked ${pick.qty_picked}x ${pick.line_items.part_number}`,
        timestamp: pick.picked_at,
        user: pick.picked_by || 'Unknown',
        order_id: pick.line_items.order_id,
        so_number: pick.line_items.orders.so_number,
      }));

      // Fetch recent undo events
      const { data: undoData, error: undoError } = await this.supabase.from('pick_undos')
        .select('*')
        .order('undone_at', { ascending: false })
        .limit(20);

      if (undoError) {
        console.error('Error fetching undo activity:', undoError);
      }

      const undoActivities: RecentActivity[] = (undoData || []).map((undo: any) => ({
        id: undo.id,
        type: 'pick_undo' as const,
        message: `Undid ${undo.qty_picked}x ${undo.part_number}`,
        timestamp: undo.undone_at,
        user: undo.undone_by || 'Unknown',
        order_id: undo.order_id,
        so_number: undo.so_number,
      }));

      // Merge and sort by timestamp descending
      const allActivities = [...pickActivities, ...undoActivities]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);

      this.activitiesSubject.next(allActivities);
    } catch (err) {
      console.error('Error fetching activity:', err);
      this.activitiesSubject.next([]);
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
