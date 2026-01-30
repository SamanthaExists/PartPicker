import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { BOMTemplate, BOMTemplateWithItems } from '../../models';

@Component({
  selector: 'app-template-select-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-file-earmark-text me-2"></i>Load from BOM Template
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">
              Select a saved BOM template to populate the order with pre-defined parts.
            </p>

            <!-- Search -->
            <div class="mb-3">
              <input
                type="text"
                class="form-control"
                placeholder="Search templates..."
                [(ngModel)]="searchQuery"
              >
            </div>

            <!-- Loading State -->
            <div *ngIf="loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="text-muted small mt-2 mb-0">Loading templates...</p>
            </div>

            <!-- Empty State -->
            <div *ngIf="!loading && filteredTemplates.length === 0" class="text-center py-4 text-muted">
              <i class="bi bi-inbox display-4 mb-2"></i>
              <p class="mb-0">{{ searchQuery ? 'No templates match your search' : 'No templates available' }}</p>
              <p class="small">Save an order as a template to see it here.</p>
            </div>

            <!-- Templates List -->
            <div *ngIf="!loading && filteredTemplates.length > 0" class="list-group" style="max-height: 400px; overflow-y: auto;">
              <button
                *ngFor="let template of filteredTemplates"
                type="button"
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                [class.active]="selectedTemplateId === template.id"
                (click)="selectTemplate(template)"
              >
                <div>
                  <strong>{{ template.name }}</strong>
                  <span *ngIf="template.tool_model" class="badge bg-secondary ms-2">{{ template.tool_model }}</span>
                  <div class="small text-muted">
                    Created: {{ formatDate(template.created_at) }}
                  </div>
                </div>
                <div class="text-end">
                  <span class="badge bg-primary" *ngIf="selectedTemplateId === template.id && selectedItemsCount > 0">
                    {{ selectedItemsCount }} parts
                  </span>
                  <i class="bi bi-chevron-right text-muted ms-2" *ngIf="selectedTemplateId !== template.id"></i>
                  <i class="bi bi-check-circle-fill text-success ms-2" *ngIf="selectedTemplateId === template.id"></i>
                </div>
              </button>
            </div>

            <!-- Selected Template Preview -->
            <div *ngIf="selectedTemplate" class="mt-3 p-3 border rounded bg-light">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>{{ selectedTemplate.name }}</strong>
                <span class="badge bg-primary">{{ selectedTemplate.items.length }} parts</span>
              </div>
              <div class="small text-muted" style="max-height: 150px; overflow-y: auto;">
                <table class="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Part Number</th>
                      <th>Description</th>
                      <th class="text-center">Qty/Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let item of selectedTemplate.items.slice(0, 10)">
                      <td class="font-monospace">{{ item.part_number }}</td>
                      <td class="text-muted">{{ item.description || '-' }}</td>
                      <td class="text-center">{{ item.qty_per_unit }}</td>
                    </tr>
                  </tbody>
                </table>
                <p *ngIf="selectedTemplate.items.length > 10" class="text-center mt-2 mb-0">
                  ...and {{ selectedTemplate.items.length - 10 }} more parts
                </p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!selectedTemplate || loadingTemplate"
              (click)="confirm()"
            >
              <i class="bi me-1" [class]="loadingTemplate ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
              {{ loadingTemplate ? 'Loading...' : 'Use Template' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="show"></div>
  `,
  styles: [`
    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class TemplateSelectDialogComponent implements OnInit, OnDestroy {
  @Input() show = false;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() templateSelected = new EventEmitter<BOMTemplateWithItems>();

  templates: BOMTemplate[] = [];
  loading = true;
  searchQuery = '';
  selectedTemplateId: string | null = null;
  selectedTemplate: BOMTemplateWithItems | null = null;
  selectedItemsCount = 0;
  loadingTemplate = false;

  private subscriptions: Subscription[] = [];

  constructor(private bomTemplatesService: BomTemplatesService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.bomTemplatesService.templates$.subscribe(templates => {
        this.templates = templates;
      }),
      this.bomTemplatesService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get filteredTemplates(): BOMTemplate[] {
    if (!this.searchQuery) return this.templates;

    const query = this.searchQuery.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.tool_model && t.tool_model.toLowerCase().includes(query))
    );
  }

  async selectTemplate(template: BOMTemplate): Promise<void> {
    if (this.selectedTemplateId === template.id) {
      // Deselect
      this.selectedTemplateId = null;
      this.selectedTemplate = null;
      this.selectedItemsCount = 0;
      return;
    }

    this.selectedTemplateId = template.id;
    this.loadingTemplate = true;

    const fullTemplate = await this.bomTemplatesService.getTemplateWithItems(template.id);
    if (fullTemplate) {
      this.selectedTemplate = fullTemplate;
      this.selectedItemsCount = fullTemplate.items.length;
    }

    this.loadingTemplate = false;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  close(): void {
    this.show = false;
    this.showChange.emit(false);
    this.selectedTemplateId = null;
    this.selectedTemplate = null;
    this.searchQuery = '';
  }

  confirm(): void {
    if (this.selectedTemplate) {
      this.templateSelected.emit(this.selectedTemplate);
      this.close();
    }
  }
}
