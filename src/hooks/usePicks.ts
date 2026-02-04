import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllFromTable } from '@/lib/supabasePagination';
import type { Pick, LineItemWithPicks, RecentActivity } from '@/types';

export function usePicks(orderId: string | undefined) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [lineItemsWithPicks, setLineItemsWithPicks] = useState<LineItemWithPicks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPicks = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch line items for this order (with pagination for large orders)
      const lineItemsData = await fetchAllFromTable(
        'line_items',
        '*',
        {
          filter: (q) => q.eq('order_id', orderId),
          order: { column: 'part_number', ascending: true },
        }
      );

      // Fetch picks for these line items
      const lineItemIds = (lineItemsData || []).map(item => item.id);

      let picksData: Pick[] = [];
      if (lineItemIds.length > 0) {
        // Supabase has a default 1000 row limit, so we need to paginate for large orders
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: picksError } = await supabase
            .from('picks')
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

      setPicks(picksData);

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

      setLineItemsWithPicks(itemsWithPicks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch picks');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPicks();

    if (!orderId) return;

    // Subscribe to real-time updates for picks
    const subscription = supabase
      .channel(`picks-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => fetchPicks()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [orderId, fetchPicks]);

  const recordPick = async (
    lineItemId: string,
    toolId: string,
    qtyPicked: number,
    pickedBy?: string,
    notes?: string
  ): Promise<Pick & { overPickWarning?: string } | null> => {
    try {
      // Check current state before picking to detect concurrent picks
      const { data: lineItem } = await supabase
        .from('line_items')
        .select('total_qty_needed')
        .eq('id', lineItemId)
        .single();

      const { data: existingPicks } = await supabase
        .from('picks')
        .select('qty_picked')
        .eq('line_item_id', lineItemId);

      const currentTotal = (existingPicks || []).reduce((sum, p) => sum + p.qty_picked, 0);
      const newTotal = currentTotal + qtyPicked;
      const needed = lineItem?.total_qty_needed || 0;

      // Record the pick
      const { data, error } = await supabase
        .from('picks')
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
      setError(err instanceof Error ? err.message : 'Failed to record pick');
      return null;
    }
  };

  const undoPick = async (pickId: string, undoneBy?: string): Promise<boolean> => {
    try {
      // Look up pick from local state
      const pick = picks.find(p => p.id === pickId);
      if (!pick) {
        throw new Error('Pick not found');
      }

      // Look up line item from local state for part_number and order_id
      const lineItem = lineItemsWithPicks.find(li => li.id === pick.line_item_id);

      // Look up tool info and order SO number from Supabase
      const { data: toolData } = await supabase
        .from('tools')
        .select('tool_number, order_id')
        .eq('id', pick.tool_id)
        .single();

      let soNumber = '';
      let orderIdForUndo = lineItem?.order_id || '';
      if (toolData) {
        orderIdForUndo = orderIdForUndo || toolData.order_id;
        const { data: orderData } = await supabase
          .from('orders')
          .select('so_number')
          .eq('id', toolData.order_id)
          .single();
        soNumber = orderData?.so_number || '';
      }

      // Insert audit snapshot into pick_undos BEFORE deleting
      const { error: auditError } = await supabase
        .from('pick_undos')
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
      const { error } = await supabase
        .from('picks')
        .delete()
        .eq('id', pickId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo pick');
      return false;
    }
  };

  // Get picks for a specific tool
  const getPicksForTool = (toolId: string): Map<string, number> => {
    const result = new Map<string, number>();
    for (const pick of picks) {
      if (pick.tool_id === toolId) {
        const current = result.get(pick.line_item_id) || 0;
        result.set(pick.line_item_id, current + pick.qty_picked);
      }
    }
    return result;
  };

  // Get pick history for a specific line item and tool (sorted by most recent first)
  const getPickHistory = (lineItemId: string, toolId: string): Pick[] => {
    return picks
      .filter(pick => pick.line_item_id === lineItemId && pick.tool_id === toolId)
      .sort((a, b) => new Date(b.picked_at).getTime() - new Date(a.picked_at).getTime());
  };

  // Get the most recent pick for a line item and tool (for undo functionality)
  const getLastPick = (lineItemId: string, toolId: string): Pick | null => {
    const history = getPickHistory(lineItemId, toolId);
    return history.length > 0 ? history[0] : null;
  };

  // Batch update allocations for multiple tools on a single line item
  // newAllocations: Map<toolId, targetQty>
  // For each tool, calculate delta from current allocation:
  // - If delta > 0: add new pick record with delta qty
  // - If delta < 0: delete existing picks (newest first) until target reached
  const batchUpdateAllocations = async (
    lineItemId: string,
    newAllocations: Map<string, number>,
    pickedBy?: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      // Get current allocations for each tool
      const allToolPicks = getPicksForAllTools();

      // Process each tool's allocation change
      for (const [toolId, targetQty] of newAllocations) {
        const toolMap = allToolPicks.get(toolId);
        const currentQty = toolMap?.get(lineItemId) || 0;
        const delta = targetQty - currentQty;

        if (delta > 0) {
          // Need to add picks - create a new pick record
          const { error } = await supabase
            .from('picks')
            .insert({
              line_item_id: lineItemId,
              tool_id: toolId,
              qty_picked: delta,
              picked_by: pickedBy || null,
              notes: notes || null,
            });

          if (error) throw error;
        } else if (delta < 0) {
          // Need to remove picks - delete picks starting from newest
          const pickHistory = getPickHistory(lineItemId, toolId);
          let qtyToRemove = Math.abs(delta);

          for (const pick of pickHistory) {
            if (qtyToRemove <= 0) break;

            if (pick.qty_picked <= qtyToRemove) {
              // Delete the entire pick record
              const { error } = await supabase
                .from('picks')
                .delete()
                .eq('id', pick.id);

              if (error) throw error;
              qtyToRemove -= pick.qty_picked;
            } else {
              // Partial removal: delete old pick and create new one with reduced qty
              const newQty = pick.qty_picked - qtyToRemove;

              // Delete the original pick
              const { error: deleteError } = await supabase
                .from('picks')
                .delete()
                .eq('id', pick.id);

              if (deleteError) throw deleteError;

              // Create a new pick with the remaining quantity
              const { error: insertError } = await supabase
                .from('picks')
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
        // If delta === 0, no action needed
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update allocations');
      return false;
    }
  };

  // Get picks for all tools at once - returns Map<toolId, Map<lineItemId, qty>>
  const getPicksForAllTools = (): Map<string, Map<string, number>> => {
    const result = new Map<string, Map<string, number>>();
    for (const pick of picks) {
      if (!result.has(pick.tool_id)) {
        result.set(pick.tool_id, new Map());
      }
      const toolMap = result.get(pick.tool_id);
      if (toolMap) {
        const current = toolMap.get(pick.line_item_id) || 0;
        toolMap.set(pick.line_item_id, current + pick.qty_picked);
      }
    }
    return result;
  };

  return {
    picks,
    lineItemsWithPicks,
    loading,
    error,
    refresh: fetchPicks,
    recordPick,
    undoPick,
    getPicksForTool,
    getPickHistory,
    getLastPick,
    getPicksForAllTools,
    batchUpdateAllocations,
  };
}

export function useRecentActivity() {
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch recent picks with order info
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
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
      const { data: undoData, error: undoError } = await supabase
        .from('pick_undos')
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

      setActivities(allActivities);
    } catch (err) {
      console.error('Error fetching activity:', err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();

    // Subscribe to real-time updates (listen to all pick events including deletes from undos)
    const subscription = supabase
      .channel('activity-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => fetchActivity()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pick_undos' },
        () => fetchActivity()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchActivity]);

  return { activities, loading, refresh: fetchActivity };
}
