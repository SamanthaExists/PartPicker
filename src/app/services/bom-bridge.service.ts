import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable } from 'rxjs';
import { BomTemplatesService } from './bom-templates.service';
import { PartsService } from './parts.service';
import { PartRelationshipsService } from './part-relationships.service';
import { SupabaseService } from './supabase.service';
import {
  UnifiedListItem,
  UnifiedItem,
  BOMTemplate,
  BOMTemplateWithItems,
  Part,
  PartWithStats,
  PartWithRelationships,
  ClassificationType,
  BOMTemplateItem
} from '../models';

/**
 * Bridge service that provides unified access to both BOM Templates and Parts.
 * Enables conversion between templates and assembly parts.
 */
@Injectable({
  providedIn: 'root'
})
export class BomBridgeService {
  constructor(
    private bomTemplates: BomTemplatesService,
    private parts: PartsService,
    private relationships: PartRelationshipsService,
    private supabase: SupabaseService
  ) {}

  /**
   * Get unified list combining templates and parts with visual indicators
   */
  listAllItems(): Observable<UnifiedListItem[]> {
    return combineLatest([
      this.bomTemplates.templates$,
      this.parts.parts$
    ]).pipe(
      map(([templates, parts]) => [
        ...this.mapTemplates(templates),
        ...this.mapParts(parts)
      ])
    );
  }

  /**
   * Get filtered list - templates only
   */
  filterTemplates(): Observable<UnifiedListItem[]> {
    return this.bomTemplates.templates$.pipe(
      map(templates => this.mapTemplates(templates))
    );
  }

  /**
   * Get filtered list - assembly parts only
   */
  filterAssemblies(): Observable<UnifiedListItem[]> {
    return this.parts.parts$.pipe(
      map(parts => this.mapParts(parts.filter(p => p.classification_type === 'assembly')))
    );
  }

  /**
   * Get filtered list - non-assembly parts
   */
  filterParts(): Observable<UnifiedListItem[]> {
    return this.parts.parts$.pipe(
      map(parts => this.mapParts(parts.filter(p => p.classification_type !== 'assembly')))
    );
  }

  /**
   * Get single item by ID and type
   */
  async getItem(id: string, type: 'template' | 'part'): Promise<UnifiedItem> {
    if (type === 'template') {
      const template = await this.bomTemplates.getTemplateWithItems(id);
      if (!template) {
        throw new Error(`Template not found: ${id}`);
      }
      return {
        type: 'template',
        data: template
      };
    } else {
      const part = await this.parts.getPartWithRelationships(id);
      if (!part) {
        throw new Error(`Part not found: ${id}`);
      }
      return {
        type: 'part',
        data: part
      };
    }
  }

  /**
   * Convert template to assembly part
   */
  async convertTemplateToAssembly(templateId: string): Promise<Part> {
    const template = await this.bomTemplates.getTemplateWithItems(templateId);

    if (!template || !template.items || template.items.length === 0) {
      throw new Error('Cannot convert empty template to assembly');
    }

    // Create assembly part
    const assemblyPartNumber = `ASSY-${template.tool_model || template.name.replace(/\s+/g, '-')}`;
    const part = await this.parts.createPart({
      part_number: assemblyPartNumber,
      description: template.name,
      classification_type: 'assembly',
      default_location: null,
      base_part_id: null,
      notes: `Converted from template: ${template.name}`
    });

    // Create relationships for each template item
    for (const item of template.items) {
      // Find or create child part
      const childPart = await this.parts.findOrCreatePart(
        item.part_number,
        item.description,
        item.location,
        null // classification_type
      );

      // Create relationship
      await this.relationships.createRelationship(
        part.id,
        childPart.id,
        item.qty_per_unit,
        {
          notes: item.assembly_group ? `Assembly Group: ${item.assembly_group}` : undefined,
          sortOrder: 0
        }
      );
    }

    // Link template to part (update template with part_id FK)
    await this.updateTemplateLinkToPart(templateId, part.id);

    return part;
  }

  /**
   * Save assembly part as template
   */
  async savePartAsTemplate(
    partId: string,
    options?: { name?: string; toolModel?: string }
  ): Promise<BOMTemplateWithItems> {
    const part = await this.parts.getPartWithRelationships(partId);

    if (!part || !part.children || part.children.length === 0) {
      throw new Error('Cannot create template from part with no children');
    }

    // Create template
    const templateName = options?.name || part.description || part.part_number;
    const toolModel = options?.toolModel || undefined;

    const template = await this.bomTemplates.createTemplate(
      templateName,
      toolModel,
      'assembly'
    );

    if (!template) {
      throw new Error('Failed to create template');
    }

    // Add template items from part relationships
    for (const rel of part.children) {
      const childPart = rel.part;

      // Extract assembly_group from notes if present
      const assemblyGroup = rel.notes?.match(/Assembly Group: (.+)/)?.[1] || null;

      await this.bomTemplates.addTemplateItem(template.id, {
        part_number: childPart.part_number,
        description: childPart.description,
        location: childPart.default_location,
        qty_per_unit: rel.quantity,
        assembly_group: assemblyGroup
      });
    }

    // Link template to part (update template with part_id FK)
    await this.updateTemplateLinkToPart(template.id, partId);

    const result = await this.bomTemplates.getTemplateWithItems(template.id);
    if (!result) {
      throw new Error('Failed to retrieve created template');
    }

    return result;
  }


  /**
   * Update template to link to assembly part
   */
  private async updateTemplateLinkToPart(templateId: string, partId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bom_templates')
      .update({ part_id: partId })
      .eq('id', templateId);

    if (error) {
      console.error('Error linking template to part:', error);
    }
  }

  /**
   * Map templates to unified list items
   */
  private mapTemplates(templates: BOMTemplate[]): UnifiedListItem[] {
    return templates.map(t => ({
      id: t.id,
      type: 'template' as const,
      displayName: t.name,
      subtitle: t.tool_model || 'No tool model',
      badges: [
        {
          text: t.template_type === 'assembly' ? 'Assembly' : 'BOM',
          color: t.template_type === 'assembly' ? 'bg-info' : 'bg-primary',
          icon: t.template_type === 'assembly' ? 'bi-boxes' : 'bi-list-ul'
        },
        ...(t.tool_model ? [{
          text: t.tool_model,
          color: 'bg-secondary',
          icon: 'bi-tools'
        }] : [])
      ],
      icon: 'bi-file-earmark-text',
      stats: {
        itemCount: 0 // Will be populated when items are loaded
      }
    }));
  }

  /**
   * Map parts to unified list items
   */
  private mapParts(parts: PartWithStats[]): UnifiedListItem[] {
    return parts.map(p => ({
      id: p.id,
      type: 'part' as const,
      displayName: p.part_number,
      subtitle: p.description || 'No description',
      badges: [
        this.getClassificationBadge(p.classification_type),
        ...(p.child_count > 0 ? [{
          text: `${p.child_count} parts`,
          color: 'bg-secondary',
          icon: 'bi-diagram-3'
        }] : []),
        ...(p.used_in_count > 0 ? [{
          text: `Used in ${p.used_in_count}`,
          color: 'bg-light text-dark',
          icon: 'bi-arrow-up'
        }] : [])
      ],
      icon: this.getClassificationIcon(p.classification_type),
      stats: {
        childCount: p.child_count,
        usedInCount: p.used_in_count
      }
    }));
  }

  /**
   * Get badge for classification type
   */
  private getClassificationBadge(type: ClassificationType | null): { text: string; color: string; icon?: string } {
    switch (type) {
      case 'assembly':
        return { text: 'Assembly', color: 'bg-primary', icon: 'bi-box-seam' };
      case 'manufactured':
        return { text: 'Manufactured', color: 'bg-warning text-dark', icon: 'bi-gear' };
      case 'purchased':
        return { text: 'Purchased', color: 'bg-success', icon: 'bi-cart' };
      case 'modified':
        return { text: 'Modified', color: 'bg-info', icon: 'bi-arrow-repeat' };
      default:
        return { text: 'Unclassified', color: 'bg-secondary' };
    }
  }

  /**
   * Get icon for classification type
   */
  private getClassificationIcon(type: ClassificationType | null): string {
    switch (type) {
      case 'assembly':
        return 'bi-box-seam';
      case 'manufactured':
        return 'bi-gear';
      case 'purchased':
        return 'bi-cart';
      case 'modified':
        return 'bi-arrow-repeat';
      default:
        return 'bi-circle';
    }
  }
}
