import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { LineItem } from '@/types';
import { getQtyForTool } from '@/lib/utils';

export interface LineItemInput {
  part_number: string;
  description?: string | null;
  location?: string | null;
  qty_per_unit: number;
  total_qty_needed: number;
  tool_ids?: string[] | null;
  qty_overrides?: Record<string, number> | null;
}

export function useLineItems(orderId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLineItem = useCallback(async (
    input: LineItemInput
  ): Promise<LineItem | null> => {
    if (!orderId) {
      setError('No order ID provided');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: insertError } = await supabase
        .from('line_items')
        .insert({
          order_id: orderId,
          part_number: input.part_number,
          description: input.description || null,
          location: input.location || null,
          qty_per_unit: input.qty_per_unit,
          total_qty_needed: input.total_qty_needed,
          tool_ids: input.tool_ids ?? null,
          qty_overrides: input.qty_overrides ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add line item';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const updateLineItem = useCallback(async (
    lineItemId: string,
    input: Partial<LineItemInput>
  ): Promise<LineItem | null> => {
    try {
      setLoading(true);
      setError(null);

      const updateData: Record<string, unknown> = {};

      if (input.part_number !== undefined) {
        updateData.part_number = input.part_number;
      }
      if (input.description !== undefined) {
        updateData.description = input.description || null;
      }
      if (input.location !== undefined) {
        updateData.location = input.location || null;
      }
      if (input.qty_per_unit !== undefined) {
        updateData.qty_per_unit = input.qty_per_unit;
      }
      if (input.total_qty_needed !== undefined) {
        updateData.total_qty_needed = input.total_qty_needed;
      }
      if (input.tool_ids !== undefined) {
        updateData.tool_ids = input.tool_ids;
      }
      if (input.qty_overrides !== undefined) {
        updateData.qty_overrides = input.qty_overrides;
      }

      const { data, error: updateError } = await supabase
        .from('line_items')
        .update(updateData)
        .eq('id', lineItemId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update line item';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteLineItem = useCallback(async (
    lineItemId: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('line_items')
        .delete()
        .eq('id', lineItemId);

      if (deleteError) throw deleteError;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete line item';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateQtyOverride = useCallback(async (
    lineItemId: string,
    toolId: string,
    qty: number,
    allToolIds: string[]
  ): Promise<LineItem | null> => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current line item to get existing overrides and qty_per_unit
      const { data: current, error: fetchError } = await supabase
        .from('line_items')
        .select('qty_per_unit, qty_overrides, tool_ids')
        .eq('id', lineItemId)
        .single();

      if (fetchError) throw fetchError;

      const overrides = { ...(current.qty_overrides || {}) };

      // If the override matches the default, remove it instead
      if (qty === current.qty_per_unit) {
        delete overrides[toolId];
      } else {
        overrides[toolId] = qty;
      }

      const cleanOverrides = Object.keys(overrides).length > 0 ? overrides : null;

      // Recompute total_qty_needed
      const applicableToolIds = (current.tool_ids && current.tool_ids.length > 0)
        ? current.tool_ids
        : allToolIds;

      const newTotal = applicableToolIds.reduce((sum: number, tid: string) => {
        return sum + (cleanOverrides?.[tid] ?? current.qty_per_unit);
      }, 0);

      const { data, error: updateError } = await supabase
        .from('line_items')
        .update({
          qty_overrides: cleanOverrides,
          total_qty_needed: newTotal,
        })
        .eq('id', lineItemId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update qty override';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetQtyOverride = useCallback(async (
    lineItemId: string,
    toolId: string,
    allToolIds: string[]
  ): Promise<LineItem | null> => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current line item
      const { data: current, error: fetchError } = await supabase
        .from('line_items')
        .select('qty_per_unit, qty_overrides, tool_ids')
        .eq('id', lineItemId)
        .single();

      if (fetchError) throw fetchError;

      const overrides = { ...(current.qty_overrides || {}) };
      delete overrides[toolId];

      const cleanOverrides = Object.keys(overrides).length > 0 ? overrides : null;

      // Recompute total_qty_needed
      const applicableToolIds = (current.tool_ids && current.tool_ids.length > 0)
        ? current.tool_ids
        : allToolIds;

      const newTotal = applicableToolIds.reduce((sum: number, tid: string) => {
        return sum + (cleanOverrides?.[tid] ?? current.qty_per_unit);
      }, 0);

      const { data, error: updateError } = await supabase
        .from('line_items')
        .update({
          qty_overrides: cleanOverrides,
          total_qty_needed: newTotal,
        })
        .eq('id', lineItemId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset qty override';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateQtyPerUnit = useCallback(async (
    lineItemId: string,
    newQty: number,
    allToolIds: string[]
  ): Promise<LineItem | null> => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current line item to get existing overrides and tool_ids
      const { data: current, error: fetchError } = await supabase
        .from('line_items')
        .select('qty_overrides, tool_ids')
        .eq('id', lineItemId)
        .single();

      if (fetchError) throw fetchError;

      const overrides = current.qty_overrides || {};

      // Determine applicable tools
      const applicableToolIds = (current.tool_ids && current.tool_ids.length > 0)
        ? current.tool_ids
        : allToolIds;

      // Recalculate total: for each tool, use override if exists, otherwise newQty
      const newTotal = applicableToolIds.reduce((sum: number, tid: string) => {
        return sum + (overrides[tid] ?? newQty);
      }, 0);

      const { data, error: updateError } = await supabase
        .from('line_items')
        .update({
          qty_per_unit: newQty,
          total_qty_needed: newTotal,
        })
        .eq('id', lineItemId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update qty per unit';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    updateQtyOverride,
    resetQtyOverride,
    updateQtyPerUnit,
    clearError,
  };
}
