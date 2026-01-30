import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems, LineItem } from '../models';

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

  constructor(private supabase: SupabaseService) {
    this.fetchTemplates();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('bom-templates-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_templates' }, () => this.fetchTemplates())
      .subscribe();
  }

  async fetchTemplates(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

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
      const [templateRes, itemsRes] = await Promise.all([
        this.supabase.from('bom_templates').select('*').eq('id', templateId).single(),
        this.supabase.from('bom_template_items').select('*').eq('template_id', templateId),
      ]);

      if (templateRes.error) throw templateRes.error;
      if (itemsRes.error) throw itemsRes.error;

      return {
        ...templateRes.data,
        items: itemsRes.data || [],
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
      // Create template
      const { data: template, error: templateError } = await this.supabase.from('bom_templates')
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
  async createTemplate(name: string, toolModel?: string): Promise<BOMTemplate | null> {
    try {
      const { data, error: insertError } = await this.supabase.from('bom_templates')
        .insert({
          name,
          tool_model: toolModel || null,
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
      // Items are deleted via CASCADE
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
}
