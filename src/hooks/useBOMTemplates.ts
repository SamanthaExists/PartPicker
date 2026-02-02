import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems, LineItem } from '@/types';

export function useBOMTemplates() {
  const [templates, setTemplates] = useState<BOMTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('bom_templates')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;
      setTemplates(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch BOM templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /**
   * Get a template with all its items
   */
  const getTemplateWithItems = useCallback(async (
    templateId: string
  ): Promise<BOMTemplateWithItems | null> => {
    try {
      // Fetch template first
      const templateRes = await supabase.from('bom_templates').select('*').eq('id', templateId).single();
      if (templateRes.error) throw templateRes.error;

      // Fetch all items with pagination (Supabase has server-side 1000 row limit)
      const PAGE_SIZE = 1000;
      let allItems: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: itemsPage, error: itemsError } = await supabase
          .from('bom_template_items')
          .select('*')
          .eq('template_id', templateId)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (itemsError) throw itemsError;

        if (itemsPage && itemsPage.length > 0) {
          allItems = allItems.concat(itemsPage);
          hasMore = itemsPage.length === PAGE_SIZE;
          page++;
        } else {
          hasMore = false;
        }
      }

      return {
        ...templateRes.data,
        items: allItems,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch template');
      return null;
    }
  }, []);

  /**
   * Create a new template from existing line items
   */
  const createTemplateFromOrder = useCallback(async (
    name: string,
    toolModel: string | null,
    lineItems: LineItem[]
  ): Promise<BOMTemplate | null> => {
    try {
      // Create template
      const { data: template, error: templateError } = await supabase
        .from('bom_templates')
        .insert({
          name,
          tool_model: toolModel,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Create template items
      const itemsToInsert = lineItems.map(item => ({
        template_id: template.id,
        part_number: item.part_number,
        description: item.description,
        location: item.location,
        qty_per_unit: item.qty_per_unit,
      }));

      const { error: itemsError } = await supabase
        .from('bom_template_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      await fetchTemplates();
      return template;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
      return null;
    }
  }, [fetchTemplates]);

  /**
   * Create a new empty template
   */
  const createTemplate = useCallback(async (
    name: string,
    toolModel?: string
  ): Promise<BOMTemplate | null> => {
    try {
      const { data, error: insertError } = await supabase
        .from('bom_templates')
        .insert({
          name,
          tool_model: toolModel || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await fetchTemplates();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
      return null;
    }
  }, [fetchTemplates]);

  /**
   * Update a template's name or tool model
   */
  const updateTemplate = useCallback(async (
    templateId: string,
    updates: { name?: string; tool_model?: string | null }
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('bom_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId);

      if (updateError) throw updateError;
      await fetchTemplates();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
      return false;
    }
  }, [fetchTemplates]);

  /**
   * Delete a template and all its items
   */
  const deleteTemplate = useCallback(async (templateId: string): Promise<boolean> => {
    try {
      // Items are deleted via CASCADE
      const { error: deleteError } = await supabase
        .from('bom_templates')
        .delete()
        .eq('id', templateId);

      if (deleteError) throw deleteError;
      await fetchTemplates();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
      return false;
    }
  }, [fetchTemplates]);

  /**
   * Add an item to a template
   */
  const addTemplateItem = useCallback(async (
    templateId: string,
    item: Omit<BOMTemplateItem, 'id' | 'template_id'>
  ): Promise<BOMTemplateItem | null> => {
    try {
      const { data, error: insertError } = await supabase
        .from('bom_template_items')
        .insert({
          template_id: templateId,
          ...item,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add template item');
      return null;
    }
  }, []);

  /**
   * Update a template item
   */
  const updateTemplateItem = useCallback(async (
    itemId: string,
    updates: Partial<Omit<BOMTemplateItem, 'id' | 'template_id'>>
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('bom_template_items')
        .update(updates)
        .eq('id', itemId);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template item');
      return false;
    }
  }, []);

  /**
   * Delete a template item
   */
  const deleteTemplateItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('bom_template_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) throw deleteError;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template item');
      return false;
    }
  }, []);

  return {
    templates,
    loading,
    error,
    refresh: fetchTemplates,
    getTemplateWithItems,
    createTemplateFromOrder,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
  };
}
