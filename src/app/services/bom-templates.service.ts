import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems, LineItem, ImportedLineItem } from '../models';
import { DemoModeService } from './demo-mode.service';
import { DemoDataService } from './demo-data.service';

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

@Injectable({
  providedIn: 'root'
})
export class BomTemplatesService implements OnDestroy {
  private templatesSubject = new BehaviorSubject<BOMTemplate[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  templates$ = this.templatesSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private demoMode: DemoModeService,
    private demoData: DemoDataService
  ) {
    this.fetchTemplates();
    if (!this.demoMode.isDemoMode()) {
      this.setupRealtimeSubscription();
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    if (this.demoMode.isDemoMode()) return;
    
    this.subscription = this.supabase.channel('bom-templates-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_templates' }, () => this.fetchTemplates())
      .subscribe();
  }

  /** Helper to fetch all rows from a table with pagination */
  private async fetchAllRows(table: string, filters?: Record<string, unknown>): Promise<any[]> {
    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = this.supabase.from(table).select('*');
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

  async fetchTemplates(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      if (this.demoMode.isDemoMode()) {
        const templates = this.demoData.getBOMTemplates();
        this.templatesSubject.next(templates);
        this.loadingSubject.next(false);
        return;
      }

      const { data, error: fetchError } = await this.supabase.from('bom_templates')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;
      this.templatesSubject.next(data || []);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch BOM templates');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Get a template with all its items
   */
  async getTemplateWithItems(templateId: string): Promise<BOMTemplateWithItems | null> {
    try {
      if (this.demoMode.isDemoMode()) {
        const templates = this.demoData.getBOMTemplates();
        const template = templates.find(t => t.id === templateId);
        if (!template) return null;
        
        const items = this.demoData.getBOMTemplateItems(templateId);
        return {
          ...template,
          items,
        };
      }

      const templateRes = await this.supabase.from('bom_templates').select('*').eq('id', templateId).single();
      if (templateRes.error) throw templateRes.error;

      const allItems = await this.fetchAllRows('bom_template_items', { template_id: templateId });

      return {
        ...templateRes.data,
        items: allItems,
      };
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch template');
      return null;
    }
  }

  /**
   * Create a new template from existing line items
   */
  async createTemplateFromOrder(name: string, toolModel: string | null, lineItems: LineItem[]): Promise<BOMTemplate | null> {
    try {
      const { data: template, error: templateError } = await this.supabase.from('bom_templates')
        .insert({
          name,
          tool_model: toolModel,
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

      const { error: itemsError } = await this.supabase.from('bom_template_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      await this.fetchTemplates();
      return template;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to create template');
      return null;
    }
  }

  /**
   * Create a new empty template
   */
  async createTemplate(name: string, toolModel?: string, templateType: 'bom' | 'assembly' = 'bom'): Promise<BOMTemplate | null> {
    try {
      const { data, error: insertError } = await this.supabase.from('bom_templates')
        .insert({
          name,
          tool_model: toolModel || null,
          template_type: templateType,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await this.fetchTemplates();
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to create template');
      return null;
    }
  }

  /**
   * Update a template's name or tool model
   */
  async updateTemplate(templateId: string, updates: { name?: string; tool_model?: string | null }): Promise<boolean> {
    try {
      const { error: updateError } = await this.supabase.from('bom_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId);

      if (updateError) throw updateError;
      await this.fetchTemplates();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update template');
      return false;
    }
  }

  /**
   * Delete a template and all its items
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    try {
      const { error: deleteError } = await this.supabase.from('bom_templates')
        .delete()
        .eq('id', templateId);

      if (deleteError) throw deleteError;
      await this.fetchTemplates();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete template');
      return false;
    }
  }

  /**
   * Add an item to a template
   */
  async addTemplateItem(templateId: string, item: Omit<BOMTemplateItem, 'id' | 'template_id'>): Promise<BOMTemplateItem | null> {
    try {
      const { data, error: insertError } = await this.supabase.from('bom_template_items')
        .insert({
          template_id: templateId,
          ...item,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to add template item');
      return null;
    }
  }

  /**
   * Update a template item
   */
  async updateTemplateItem(itemId: string, updates: Partial<Omit<BOMTemplateItem, 'id' | 'template_id'>>): Promise<boolean> {
    try {
      const { error: updateError } = await this.supabase.from('bom_template_items')
        .update(updates)
        .eq('id', itemId);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update template item');
      return false;
    }
  }

  /**
   * Delete a template item
   */
  async deleteTemplateItem(itemId: string): Promise<boolean> {
    try {
      const { error: deleteError } = await this.supabase.from('bom_template_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) throw deleteError;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete template item');
      return false;
    }
  }

  /**
   * Extract templates from all existing orders.
   * Groups orders by BOM fingerprint, creates one template per unique BOM,
   * skipping any that already match an existing template.
   */
  async extractTemplatesFromOrders(): Promise<{
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const result = { created: 0, skipped: 0, errors: [] as string[] };

    try {
      // 1. Fetch all orders
      const allOrders = await this.fetchAllRows('orders');

      // 2. Fetch all line_items
      const allLineItems = await this.fetchAllRows('line_items');

      // 3. Group line_items by order_id
      const lineItemsByOrder: Record<string, any[]> = {};
      for (const li of allLineItems) {
        if (!lineItemsByOrder[li.order_id]) {
          lineItemsByOrder[li.order_id] = [];
        }
        lineItemsByOrder[li.order_id].push(li);
      }

      // 4. Fetch all existing templates with items, compute fingerprints
      const existingTemplates = await this.fetchAllRows('bom_templates');
      const existingTemplateItems = await this.fetchAllRows('bom_template_items');

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

          const { data: template, error: templateError } = await this.supabase
            .from('bom_templates')
            .insert({
              name: templateName,
              tool_model: order.tool_model || null,
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

          const { error: itemsError } = await this.supabase
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

      await this.fetchTemplates();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'Failed to extract templates');
    }

    return result;
  }

  /**
   * Auto-extract a template from a freshly imported order's line items.
   * If the BOM fingerprint matches an existing template, no action is taken.
   */
  async autoExtractTemplate(
    lineItems: ImportedLineItem[],
    toolModel: string | null,
    soNumber: string
  ): Promise<{ matched: boolean; templateId?: string; templateName?: string }> {
    try {
      // 1. Compute fingerprint of the imported line items
      const fp = generateBOMFingerprint(lineItems);

      // 2. Fetch all existing templates with items
      const existingTemplates = await this.fetchAllRows('bom_templates');
      const existingTemplateItems = await this.fetchAllRows('bom_template_items');

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

      const { data: template, error: templateError } = await this.supabase
        .from('bom_templates')
        .insert({
          name: templateName,
          tool_model: toolModel || null,
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

      const { error: itemsError } = await this.supabase
        .from('bom_template_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      await this.fetchTemplates();
      return { matched: false, templateId: template.id, templateName };
    } catch {
      // Auto-extraction is best-effort — don't block the import
      return { matched: true };
    }
  }
}
