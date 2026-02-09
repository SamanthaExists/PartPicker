import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllFromTable } from '@/lib/supabasePagination';
import type { Order, OrderWithProgress, Tool, LineItem, ImportedOrder } from '@/types';

interface OrderProgressRow {
  total_items: number;
  picked_items: number;
  progress_percent: number;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch orders with tools and server-computed progress in a single query
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          tools (*),
          order_progress (total_items, picked_items, progress_percent)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithProgress: OrderWithProgress[] = (ordersData || []).map(order => {
        // order_progress is a 1-to-1 relation via order_id, Supabase returns it as an array
        const progress = (order.order_progress as OrderProgressRow[] | null)?.[0];
        return {
          ...order,
          tools: order.tools || [],
          total_items: progress?.total_items ?? 0,
          picked_items: progress?.picked_items ?? 0,
          progress_percent: progress?.progress_percent ?? 0,
        };
      });

      setOrders(ordersWithProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    // Subscribe to real-time updates on orders table only
    // Pick changes are handled by useOrder/usePicks at the order detail level
    const ordersSubscription = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      ordersSubscription.unsubscribe();
    };
  }, [fetchOrders]);

  const createOrder = async (order: Partial<Order>): Promise<Order | null> => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert({
          so_number: order.so_number!,
          po_number: order.po_number || null,
          customer_name: order.customer_name || null,
          order_date: order.order_date || null,
          due_date: order.due_date || null,
          estimated_ship_date: order.estimated_ship_date || null,
          status: order.status || 'active',
          notes: order.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      return null;
    }
  };

  const importOrder = async (imported: ImportedOrder): Promise<Order | null> => {
    try {
      // Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
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

        const { data: toolsData, error: toolsError } = await supabase
          .from('tools')
          .insert(toolsToInsert)
          .select('id, tool_number');

        if (toolsError) throw toolsError;
        createdTools = toolsData || [];
      }

      // Create line items
      if (imported.line_items.length > 0) {
        // Create a map from temp tool IDs to real tool IDs
        const toolIdMap = new Map<string, string>();
        for (const tool of createdTools) {
          toolIdMap.set(`temp-${tool.tool_number}`, tool.id);
        }

        const itemsToInsert = imported.line_items.map(item => {
          // Map temp tool IDs to real tool IDs if present
          let toolIds: string[] | null = null;
          if (item.tool_ids && item.tool_ids.length > 0) {
            toolIds = item.tool_ids
              .map(tempId => toolIdMap.get(tempId))
              .filter((id): id is string => id !== undefined);
            // If no valid IDs, set to null (applies to all tools)
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

        const { error: itemsError } = await supabase
          .from('line_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      await fetchOrders();
      return orderData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import order');
      return null;
    }
  };

  const updateOrder = async (id: string, updates: Partial<Order>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
      return false;
    }
  };

  const deleteOrder = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchOrders();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete order');
      return false;
    }
  };

  return {
    orders,
    loading,
    error,
    refresh: fetchOrders,
    createOrder,
    importOrder,
    updateOrder,
    deleteOrder,
  };
}

export function useOrder(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch tools and line items with pagination (large orders could have >1000 parts)
      const [toolsData, lineItemsData] = await Promise.all([
        fetchAllFromTable<Tool>('tools', '*', {
          filter: (q) => q.eq('order_id', orderId),
          order: { column: 'tool_number', ascending: true },
        }),
        fetchAllFromTable<LineItem>('line_items', '*', {
          filter: (q) => q.eq('order_id', orderId),
          order: { column: 'part_number', ascending: true },
        }),
      ]);

      setOrder(orderData);
      setTools(toolsData);
      setLineItems(lineItemsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();

    if (!orderId) return;

    // Subscribe to real-time updates for this order
    const subscription = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => fetchOrder()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tools', filter: `order_id=eq.${orderId}` },
        () => fetchOrder()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'line_items', filter: `order_id=eq.${orderId}` },
        () => fetchOrder()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [orderId, fetchOrder]);

  // Generate the next tool number based on SO number and existing tools
  const generateNextToolNumber = useCallback((soNumber: string, existingTools: Tool[]): string => {
    // Extract the numeric suffix from existing tool numbers (e.g., "3137-1" -> 1)
    const existingSuffixes = existingTools
      .map((t) => {
        const match = t.tool_number.match(/-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const nextSuffix = existingSuffixes.length > 0 ? Math.max(...existingSuffixes) + 1 : 1;
    return `${soNumber}-${nextSuffix}`;
  }, []);

  const addTool = async (toolNumber: string, serialNumber?: string, toolModel?: string): Promise<Tool | null> => {
    if (!orderId) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('tools')
        .insert({
          order_id: orderId,
          tool_number: toolNumber,
          serial_number: serialNumber || null,
          tool_model: toolModel || null,
          status: 'pending' as const,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      // Recalculate total_qty_needed on line items to reflect the new tool count
      await supabase.rpc('recalculate_line_item_totals', { target_order_id: orderId });
      await fetchOrder();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tool');
      return null;
    }
  };

  const deleteTool = async (toolId: string): Promise<boolean> => {
    try {
      // CASCADE delete is set up in schema, so picks will be deleted automatically
      const { error: deleteError } = await supabase
        .from('tools')
        .delete()
        .eq('id', toolId);

      if (deleteError) throw deleteError;
      // Recalculate total_qty_needed on line items to reflect the reduced tool count
      await supabase.rpc('recalculate_line_item_totals', { target_order_id: orderId! });
      await fetchOrder();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tool');
      return false;
    }
  };

  return {
    order,
    tools,
    lineItems,
    loading,
    error,
    refresh: fetchOrder,
    addTool,
    deleteTool,
    generateNextToolNumber,
  };
}
