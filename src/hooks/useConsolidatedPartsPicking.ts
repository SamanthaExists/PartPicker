import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ConsolidatedPart } from '@/types';

// Partial types for what we fetch
interface ToolPartial {
  id: string;
  order_id: string;
  tool_number: string;
  serial_number: string | null;
}

interface PickPartial {
  id: string;
  line_item_id: string;
  tool_id: string;
  qty_picked: number;
}

export interface ToolPickingInfo {
  tool_id: string;
  tool_number: string;
  serial_number: string | null;
  qty_per_unit: number;
  current_picked: number;
}

export interface OrderPickingData {
  order_id: string;
  so_number: string;
  line_item_id: string;
  needed: number;
  picked: number;
  tools: ToolPickingInfo[];
}

export interface PickingDataResult {
  orders: OrderPickingData[];
  totalNeeded: number;
  totalPicked: number;
}

// Allocation to save: line_item_id -> tool_id -> target qty
export type BatchAllocations = Map<string, Map<string, number>>;

export function useConsolidatedPartsPicking() {
  const [pickingData, setPickingData] = useState<PickingDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all picking data for a consolidated part
  const fetchPickingDataForPart = useCallback(async (part: ConsolidatedPart): Promise<PickingDataResult | null> => {
    try {
      setLoading(true);
      setError(null);

      const lineItemIds = part.orders.map(o => o.line_item_id).filter(Boolean);

      if (lineItemIds.length === 0) {
        throw new Error('No line item IDs found. Try refreshing the page.');
      }

      // Fetch line items with their qty_per_unit and tool_ids
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('line_items')
        .select('id, order_id, qty_per_unit, tool_ids')
        .in('id', lineItemIds);

      if (lineItemsError) throw lineItemsError;

      // Create map of line item data
      const lineItemMap = new Map<string, { qty_per_unit: number; tool_ids: string[] | null }>();
      for (const li of lineItemsData || []) {
        lineItemMap.set(li.id, { qty_per_unit: li.qty_per_unit, tool_ids: li.tool_ids });
      }

      // Fetch all tools for the orders involved
      const orderIds = part.orders.map(o => o.order_id);

      const { data: toolsData, error: toolsError } = await supabase
        .from('tools')
        .select('id, order_id, tool_number, serial_number')
        .in('order_id', orderIds)
        .order('tool_number');

      if (toolsError) throw toolsError;

      // Group tools by order
      const toolsByOrder = new Map<string, ToolPartial[]>();
      for (const tool of (toolsData || []) as ToolPartial[]) {
        const existing = toolsByOrder.get(tool.order_id) || [];
        existing.push(tool);
        toolsByOrder.set(tool.order_id, existing);
      }

      // Fetch all picks for these line items
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select('id, line_item_id, tool_id, qty_picked')
        .in('line_item_id', lineItemIds);

      if (picksError) throw picksError;

      // Group picks by line_item_id and tool_id
      // Map<line_item_id, Map<tool_id, total_picked>>
      const picksByLineItemAndTool = new Map<string, Map<string, number>>();
      for (const pick of picksData || []) {
        if (!picksByLineItemAndTool.has(pick.line_item_id)) {
          picksByLineItemAndTool.set(pick.line_item_id, new Map());
        }
        const toolMap = picksByLineItemAndTool.get(pick.line_item_id)!;
        const current = toolMap.get(pick.tool_id) || 0;
        toolMap.set(pick.tool_id, current + pick.qty_picked);
      }

      // Build the picking data structure
      const orders: OrderPickingData[] = [];
      let totalNeeded = 0;
      let totalPicked = 0;

      for (const orderInfo of part.orders) {
        const orderTools = toolsByOrder.get(orderInfo.order_id) || [];
        const lineItemData = lineItemMap.get(orderInfo.line_item_id);
        const qtyPerUnit = lineItemData?.qty_per_unit || 1;
        const toolIds = lineItemData?.tool_ids;

        // Filter tools by tool_ids — only show tools this line item applies to
        const applicableTools = (!toolIds || toolIds.length === 0)
          ? orderTools
          : orderTools.filter(t => toolIds.includes(t.id));

        const toolPicksMap = picksByLineItemAndTool.get(orderInfo.line_item_id) || new Map();

        const tools: ToolPickingInfo[] = applicableTools.map(tool => ({
          tool_id: tool.id,
          tool_number: tool.tool_number,
          serial_number: tool.serial_number,
          qty_per_unit: qtyPerUnit,
          current_picked: toolPicksMap.get(tool.id) || 0,
        }));

        const orderPicked = tools.reduce((sum, t) => sum + t.current_picked, 0);
        const orderNeeded = tools.length * qtyPerUnit;

        orders.push({
          order_id: orderInfo.order_id,
          so_number: orderInfo.so_number,
          line_item_id: orderInfo.line_item_id,
          needed: orderNeeded,
          picked: orderPicked,
          tools,
        });

        totalNeeded += orderNeeded;
        totalPicked += orderPicked;
      }

      const result = { orders, totalNeeded, totalPicked };
      setPickingData(result);
      return result;
    } catch (err) {
      console.error('Error fetching picking data:', err);
      const message = err instanceof Error ? err.message : 'Failed to fetch picking data';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Save batch allocations across multiple orders/tools
  const saveBatchAllocations = useCallback(async (
    allocations: BatchAllocations,
    pickedBy?: string
  ): Promise<boolean> => {
    if (!pickingData) return false;

    try {
      setLoading(true);
      setError(null);

      // For each line item, get current picks and compute deltas
      for (const [lineItemId, toolAllocations] of allocations) {
        // Find the order data for this line item
        const orderData = pickingData.orders.find(o => o.line_item_id === lineItemId);
        if (!orderData) continue;

        // Fetch current picks for this line item to get pick IDs
        const { data: currentPicks, error: fetchError } = await supabase
          .from('picks')
          .select('id, tool_id, qty_picked')
          .eq('line_item_id', lineItemId)
          .order('picked_at', { ascending: false });

        if (fetchError) throw fetchError;

        // Group current picks by tool
        const picksByTool = new Map<string, PickPartial[]>();
        for (const pick of (currentPicks || []) as PickPartial[]) {
          const existing = picksByTool.get(pick.tool_id) || [];
          existing.push(pick);
          picksByTool.set(pick.tool_id, existing);
        }

        // Process each tool allocation
        for (const [toolId, targetQty] of toolAllocations) {
          const toolInfo = orderData.tools.find(t => t.tool_id === toolId);
          if (!toolInfo) continue;

          const currentQty = toolInfo.current_picked;
          const delta = targetQty - currentQty;

          if (delta > 0) {
            // Need to add picks
            const { error: insertError } = await supabase
              .from('picks')
              .insert({
                line_item_id: lineItemId,
                tool_id: toolId,
                qty_picked: delta,
                picked_by: pickedBy || null,
              });

            if (insertError) throw insertError;
          } else if (delta < 0) {
            // Need to remove picks
            const toolPicks = picksByTool.get(toolId) || [];
            let qtyToRemove = Math.abs(delta);

            for (const pick of toolPicks) {
              if (qtyToRemove <= 0) break;

              if (pick.qty_picked <= qtyToRemove) {
                // Delete entire pick
                const { error: deleteError } = await supabase
                  .from('picks')
                  .delete()
                  .eq('id', pick.id);

                if (deleteError) throw deleteError;
                qtyToRemove -= pick.qty_picked;
              } else {
                // Partial: delete and recreate with reduced qty
                const newQty = pick.qty_picked - qtyToRemove;

                const { error: deleteError } = await supabase
                  .from('picks')
                  .delete()
                  .eq('id', pick.id);

                if (deleteError) throw deleteError;

                const { error: insertError } = await supabase
                  .from('picks')
                  .insert({
                    line_item_id: lineItemId,
                    tool_id: toolId,
                    qty_picked: newQty,
                    picked_by: pickedBy || null,
                  });

                if (insertError) throw insertError;
                qtyToRemove = 0;
              }
            }
          }
        }
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save allocations';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [pickingData]);

  const clearPickingData = useCallback(() => {
    setPickingData(null);
    setError(null);
  }, []);

  return {
    pickingData,
    loading,
    error,
    fetchPickingDataForPart,
    saveBatchAllocations,
    clearPickingData,
  };
}
