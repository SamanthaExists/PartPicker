import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { BomBridgeService } from '../../services/bom-bridge.service';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { PartsService } from '../../services/parts.service';
import { ToastService } from '../../services/toast.service';
import {
  UnifiedItem,
  BOMTemplateWithItems,
  PartWithRelationships,
  BOMTemplateItem
} from '../../models';
import { BOMEditorComponent } from './bom-editor.component';
import { ClassificationBadgeComponent } from './classification-badge.component';

interface AssemblyGroup {
  name: string;
  key: string | null;
  count: number;
}

@Component({
  selector: 'app-unified-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, BOMEditorComponent, ClassificationBadgeComponent],
  templateUrl: './unified-detail.component.html',
  styleUrls: ['./unified-detail.component.css']
})
export class UnifiedDetailComponent implements OnInit {
  @Input() itemId!: string;
  @Input() itemType!: 'template' | 'part';
  @Output() itemUpdated = new EventEmitter<void>();

  item: UnifiedItem | null = null;
  loading = true;
  error: string | null = null;

  // Template-specific properties
  selectedAssemblyFilter: string | null = null;
  assemblyGroups: AssemblyGroup[] = [];
  hasMultipleAssemblies = false;
  templateItemSearch = '';

  // Part-specific properties  showBomEditor = false;

  constructor(
    public activeModal: NgbActiveModal,
    private bridge: BomBridgeService,
    private bomTemplates: BomTemplatesService,
    private parts: PartsService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadItem();
  }

  /**
   * Load item data
   */
  async loadItem(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      this.item = await this.bridge.getItem(this.itemId, this.itemType);

      if (this.item.type === 'template') {
        this.initializeTemplateView();
      }

      this.loading = false;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load item';
      this.loading = false;
    }
  }

  /**
   * Initialize template-specific view
   */
  private initializeTemplateView(): void {
    if (this.item?.type !== 'template') return;

    const template = this.item.data as BOMTemplateWithItems;
    const groups = new Map<string, number>();

    template.items.forEach(item => {
      const group = item.assembly_group || '__unassigned__';
      groups.set(group, (groups.get(group) || 0) + 1);
    });

    this.assemblyGroups = Array.from(groups.entries())
      .map(([key, count]) => ({
        name: key === '__unassigned__' ? 'Loose Parts' : key,
        key: key,
        count
      }))
      .sort((a, b) => {
        if (a.key === '__unassigned__') return 1;
        if (b.key === '__unassigned__') return -1;
        return a.name.localeCompare(b.name);
      });

    this.hasMultipleAssemblies = this.assemblyGroups.length >= 2;
  }

  /**
   * Get template data (type guard)
   */
  get templateData(): BOMTemplateWithItems | null {
    return this.item?.type === 'template' ? (this.item.data as BOMTemplateWithItems) : null;
  }

  /**
   * Get part data (type guard)
   */
  get partData(): PartWithRelationships | null {
    return this.item?.type === 'part' ? (this.item.data as PartWithRelationships) : null;
  }

  /**
   * Get filtered template items
   */
  get filteredTemplateItems(): BOMTemplateItem[] {
    if (!this.templateData) return [];

    let items = this.templateData.items;

    // Filter by assembly group
    if (this.selectedAssemblyFilter !== null) {
      items = items.filter(item =>
        (item.assembly_group || '__unassigned__') === this.selectedAssemblyFilter
      );
    }

    // Filter by search
    if (this.templateItemSearch.trim()) {
      const query = this.templateItemSearch.toLowerCase();
      items = items.filter(item =>
        item.part_number.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.location && item.location.toLowerCase().includes(query))
      );
    }

    return items;
  }

  /**
   * Select assembly group filter
   */
  selectAssembly(key: string | null): void {
    this.selectedAssemblyFilter = key;
  }

  /**
   * Get active filter name
   */
  get activeFilterName(): string {
    if (!this.selectedAssemblyFilter) return 'All Items';
    const group = this.assemblyGroups.find(g => g.key === this.selectedAssemblyFilter);
    return group ? group.name : 'Unknown';
  }

  /**
   * Convert template to assembly part
   */
  async convertToAssembly(): Promise<void> {
    if (!this.templateData) return;

    if (!confirm(`Convert "${this.templateData.name}" to an engineering BOM assembly part?\n\nThis will create a new assembly part with full BOM relationships.`)) {
      return;
    }

    try {
      this.loading = true;
      const newPart = await this.bridge.convertTemplateToAssembly(this.templateData.id);
      this.toast.success(`Successfully created assembly part: ${newPart.part_number}`);
      this.itemUpdated.emit();
      this.activeModal.close('converted');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Failed to convert template');
      this.loading = false;
    }
  }

  /**
   * Save part as template
   */
  async saveAsTemplate(): Promise<void> {
    if (!this.partData) return;

    const name = prompt(`Enter template name:`, this.partData.description || this.partData.part_number);
    if (!name) return;

    try {
      this.loading = true;
      const newTemplate = await this.bridge.savePartAsTemplate(this.partData.id, { name });
      this.toast.success(`Successfully created template: ${newTemplate.name}`);
      this.itemUpdated.emit();
      this.activeModal.close('saved');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Failed to save as template');
      this.loading = false;
    }
  }

  /**
   * Close modal
   */
  close(): void {
    this.activeModal.dismiss();
  }
}
