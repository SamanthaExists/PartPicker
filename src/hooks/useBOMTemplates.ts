import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems, LineItem, ImportedLineItem } from '@/types';

/**
 * Generate a fingerprint string for a set of BOM items.
 * Two identical BOMs (same parts + quantities) produce the same fingerprint.
 */
export function generateBOMFingerprint(
  items: { part_number: string; qty_per_unit: number }[]
): string {
  return items
    .map(i => `${i.part_number}:${i.qty_per_unit}`)
    .sort()
    .join('|');
}

/** Helper to fetch all rows from a table with pagination */
async function fetchAllRows(table: string, filters?: Record<string, unknown>) {
  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select('*');
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
    }
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

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
      const templateRes = await supabase.from('bom_templates').select('*').eq('id', templateId).single();
      if (templateRes.error) throw templateRes.error;

      const allItems = await fetchAllRows('bom_template_items', { template_id: templateId });

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
      const { data: template, error: templateError } = await supabase
        .from('bom_templates')
        .insert({
          name,
          tool_model: toolModel,
          template_type: 'bom',
        })
        .select()
        .single();

      if (templateError) throw templateError;

      const itemsToInsert = lineItems.map(item => ({
        template_id: template.id,
        part_number: item.part_number,
        description: item.description,
        location: item.location,
        qty_per_unit: item.qty_per_unit,
        assembly_group: item.assembly_group || null,
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
    toolModel?: string,
    templateType: 'bom' | 'assembly' = 'bom'
  ): Promise<BOMTemplate | null> => {
    try {
      const { data, error: insertError } = await supabase
        .from('bom_templates')
        .insert({
          name,
          tool_model: toolModel || null,
          template_type: templateType,
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

  /**
   * Extract templates from all existing orders.
   * Groups orders by BOM fingerprint, creates one template per unique BOM,
   * skipping any that already match an existing template.
   */
  const extractTemplatesFromOrders = useCallback(async (): Promise<{
    created: number;
    skipped: number;
    errors: string[];
  }> => {
    const result = { created: 0, skipped: 0, errors: [] as string[] };

    try {
      // 1. Fetch all orders
      const allOrders = await fetchAllRows('orders');

      // 2. Fetch all line_items
      const allLineItems = await fetchAllRows('line_items');

      // 3. Group line_items by order_id
      const lineItemsByOrder: Record<string, any[]> = {};
      for (const li of allLineItems) {
        if (!lineItemsByOrder[li.order_id]) {
          lineItemsByOrder[li.order_id] = [];
        }
        lineItemsByOrder[li.order_id].push(li);
      }

      // 4. Fetch all existing templates with items, compute fingerprints
      const existingTemplates = await fetchAllRows('bom_templates');
      const existingTemplateItems = await fetchAllRows('bom_template_items');

      const templateItemsByTemplate: Record<string, any[]> = {};
      for (const ti of existingTemplateItems) {
        if (!templateItemsByTemplate[ti.template_id]) {
          templateItemsByTemplate[ti.template_id] = [];
        }
        templateItemsByTemplate[ti.template_id].push(ti);
      }

      const existingFingerprints = new Set<string>();
      for (const t of existingTemplates) {
        const items = templateItemsByTemplate[t.id] || [];
        existingFingerprints.add(generateBOMFingerprint(items));
      }

      // 5. For each order, compute fingerprint and group by fingerprint
      const fingerprintMap: Record<string, { order: any; lineItems: any[] }> = {};
      for (const order of allOrders) {
        const items = lineItemsByOrder[order.id];
        if (!items || items.length === 0) continue;

        const fp = generateBOMFingerprint(items);
        if (!fingerprintMap[fp]) {
          fingerprintMap[fp] = { order, lineItems: items };
        }
      }

      // 6. Create templates for unique fingerprints not matching existing
      for (const [fp, { order, lineItems }] of Object.entries(fingerprintMap)) {
        if (existingFingerprints.has(fp)) {
          result.skipped++;
          continue;
        }

        try {
          const templateName = order.tool_model
            ? `${order.tool_model} BOM`
            : `SO-${order.so_number} BOM`;

          const { data: template, error: templateError } = await supabase
            .from('bom_templates')
            .insert({
              name: templateName,
              tool_model: order.tool_model || null,
              template_type: 'bom',
            })
            .select()
            .single();

          if (templateError) throw templateError;

          const itemsToInsert = lineItems.map((item: any) => ({
            template_id: template.id,
            part_number: item.part_number,
            description: item.description,
            location: item.location,
            qty_per_unit: item.qty_per_unit,
            assembly_group: item.assembly_group || null,
          }));

          const { error: itemsError } = await supabase
            .from('bom_template_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          existingFingerprints.add(fp);
          result.created++;
        } catch (err) {
          result.errors.push(
            `Failed to create template for SO-${order.so_number}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      await fetchTemplates();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'Failed to extract templates');
    }

    return result;
  }, [fetchTemplates]);

  /**
   * Auto-extract a template from a freshly imported order's line items.
   * If the BOM fingerprint matches an existing template, no action is taken.
   */
  const autoExtractTemplate = useCallback(async (
    lineItems: ImportedLineItem[],
    toolModel: string | null,
    soNumber: string
  ): Promise<{ matched: boolean; templateId?: string; templateName?: string }> => {
    try {
      // 1. Compute fingerprint of the imported line items
      const fp = generateBOMFingerprint(lineItems);

      // 2. Fetch all existing templates with items
      const existingTemplates = await fetchAllRows('bom_templates');
      const existingTemplateItems = await fetchAllRows('bom_template_items');

      const templateItemsByTemplate: Record<string, any[]> = {};
      for (const ti of existingTemplateItems) {
        if (!templateItemsByTemplate[ti.template_id]) {
          templateItemsByTemplate[ti.template_id] = [];
        }
        templateItemsByTemplate[ti.template_id].push(ti);
      }

      // 3. Check for match
      for (const t of existingTemplates) {
        const items = templateItemsByTemplate[t.id] || [];
        if (generateBOMFingerprint(items) === fp) {
          return { matched: true };
        }
      }

      // 4. No match — create new template
      const templateName = toolModel
        ? `${toolModel} BOM`
        : `SO-${soNumber} BOM`;

      const { data: template, error: templateError } = await supabase
        .from('bom_templates')
        .insert({
          name: templateName,
          tool_model: toolModel || null,
          template_type: 'bom',
        })
        .select()
        .single();

      if (templateError) throw templateError;

      const itemsToInsert = lineItems.map(item => ({
        template_id: template.id,
        part_number: item.part_number,
        description: item.description || null,
        location: item.location || null,
        qty_per_unit: item.qty_per_unit,
        assembly_group: item.assembly_group || null,
      }));

      const { error: itemsError } = await supabase
        .from('bom_template_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      await fetchTemplates();
      return { matched: false, templateId: template.id, templateName };
    } catch {
      // Auto-extraction is best-effort — don't block the import
      return { matched: true };
    }
  }, [fetchTemplates]);

  /**
   * Auto-extract assembly templates from imported line items.
   * For each unique assembly_group, creates a separate assembly template
   * if a matching fingerprint doesn't already exist.
   */
  const autoExtractAssemblyTemplates = useCallback(async (
    lineItems: ImportedLineItem[]
  ): Promise<{ created: number; skipped: number; assemblyNames: string[] }> => {
    const result = { created: 0, skipped: 0, assemblyNames: [] as string[] };

    try {
      // 1. Get unique assembly groups (excluding null/empty)
      const assemblyGroups = new Set<string>();
      for (const item of lineItems) {
        if (item.assembly_group && item.assembly_group.trim()) {
          assemblyGroups.add(item.assembly_group.trim());
        }
      }

      if (assemblyGroups.size === 0) {
        return result;
      }

      // 2. Fetch all existing assembly templates with items
      const existingTemplates = await fetchAllRows('bom_templates');
      const existingTemplateItems = await fetchAllRows('bom_template_items');

      const templateItemsByTemplate: Record<string, any[]> = {};
      for (const ti of existingTemplateItems) {
        if (!templateItemsByTemplate[ti.template_id]) {
          templateItemsByTemplate[ti.template_id] = [];
        }
        templateItemsByTemplate[ti.template_id].push(ti);
      }

      // Build fingerprints for existing assembly templates
      const existingFingerprints = new Set<string>();
      for (const t of existingTemplates) {
        if (t.template_type === 'assembly') {
          const items = templateItemsByTemplate[t.id] || [];
          existingFingerprints.add(generateBOMFingerprint(items));
        }
      }

      // 3. For each assembly group, check fingerprint and create if new
      for (const assemblyGroup of assemblyGroups) {
        const assemblyItems = lineItems.filter(
          item => item.assembly_group?.trim() === assemblyGroup
        );

        if (assemblyItems.length === 0) continue;

        const fp = generateBOMFingerprint(assemblyItems);

        if (existingFingerprints.has(fp)) {
          result.skipped++;
          continue;
        }

        // Create new assembly template
        const templateName = `${assemblyGroup} Assembly`;

        const { data: template, error: templateError } = await supabase
          .from('bom_templates')
          .insert({
            name: templateName,
            tool_model: null,
            template_type: 'assembly',
          })
          .select()
          .single();

        if (templateError) {
          console.error(`Failed to create assembly template for ${assemblyGroup}:`, templateError);
          continue;
        }

        const itemsToInsert = assemblyItems.map(item => ({
          template_id: template.id,
          part_number: item.part_number,
          description: item.description || null,
          location: item.location || null,
          qty_per_unit: item.qty_per_unit,
          assembly_group: item.assembly_group || null,
        }));

        const { error: itemsError } = await supabase
          .from('bom_template_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error(`Failed to insert items for assembly ${assemblyGroup}:`, itemsError);
          continue;
        }

        existingFingerprints.add(fp);
        result.created++;
        result.assemblyNames.push(assemblyGroup);
      }

      if (result.created > 0) {
        await fetchTemplates();
      }
    } catch (err) {
      console.error('Error extracting assembly templates:', err);
    }

    return result;
  }, [fetchTemplates]);

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
    extractTemplatesFromOrders,
    autoExtractTemplate,
    autoExtractAssemblyTemplates,
  };
}
