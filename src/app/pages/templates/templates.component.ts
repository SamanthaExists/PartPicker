import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { PartsService } from '../../services/parts.service';
import { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems, Part } from '../../models';
import { ClassificationBadgeComponent } from '../../components/parts/classification-badge.component';
import { ExplodedBOMDialogComponent } from '../../components/parts/exploded-bom-dialog.component';

interface AssemblyGroup {
  name: string;
  key: string | null;  // null = "All", '__unassigned__' = loose parts, or assembly name
  count: number;
}

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassificationBadgeComponent, ExplodedBOMDialogComponent],
  template: `
    <!-- Detail View -->
    <div *ngIf="selectedTemplate; else listView">
      <!-- Header -->
      <div class="d-flex align-items-center gap-3 mb-4">
        <button class="btn btn-outline-secondary btn-sm" (click)="selectedTemplate = null">
          <i class="bi bi-arrow-left me-1"></i> Back
        </button>
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2">
            <h1 class="h3 fw-bold mb-0">{{ selectedTemplate.name }}</h1>
            <span *ngIf="selectedTemplate.tool_model" class="badge bg-secondary">{{ selectedTemplate.tool_model }}</span>
          </div>
          <small class="text-muted">{{ selectedTemplate.items.length }} items</small>
        </div>
        <button class="btn btn-outline-primary btn-sm" (click)="openEditTemplate(selectedTemplate)">
          <i class="bi bi-pencil me-1"></i> Edit
        </button>
      </div>

      <!-- Assembly Overview Cards (only when 2+ assembly groups) -->
      <div *ngIf="hasMultipleAssemblies" class="row g-3 mb-4">
        <!-- All Items Card -->
        <div class="col-6 col-sm-4 col-md-3 col-lg-2">
          <div class="card assembly-card"
               [class.border-primary]="selectedAssemblyFilter === null"
               [class.shadow-sm]="selectedAssemblyFilter === null"
               role="button"
               (click)="selectAssembly(null)">
            <div class="card-body text-center p-3">
              <div class="icon-circle icon-circle-blue mx-auto mb-2">
                <i class="bi bi-list-task"></i>
              </div>
              <div class="fw-medium small">All Items</div>
              <span class="badge bg-primary">{{ selectedTemplate.items.length }}</span>
            </div>
          </div>
        </div>

        <!-- Assembly Group Cards -->
        <div *ngFor="let group of assemblyGroups" class="col-6 col-sm-4 col-md-3 col-lg-2">
          <div class="card assembly-card"
               [class.border-purple]="selectedAssemblyFilter === group.key"
               [class.shadow-sm]="selectedAssemblyFilter === group.key"
               role="button"
               (click)="selectAssembly(group.key)">
            <div class="card-body text-center p-3">
              <div class="icon-circle mx-auto mb-2"
                   [ngClass]="group.key === '__unassigned__' ? 'icon-circle-gray' : 'icon-circle-purple'">
                <i class="bi" [ngClass]="group.key === '__unassigned__' ? 'bi-puzzle' : 'bi-box-seam'"></i>
              </div>
              <div class="fw-medium small text-truncate">{{ group.name }}</div>
              <span class="badge" [ngClass]="group.key === '__unassigned__' ? 'bg-secondary' : 'bg-purple'">{{ group.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Assembly Tab Bar (only when 2+ assembly groups) -->
      <div *ngIf="hasMultipleAssemblies" class="nav-tabs-scroll mb-3">
        <ul class="nav nav-tabs flex-nowrap">
          <li class="nav-item">
            <a class="nav-link"
               [class.active]="selectedAssemblyFilter === null"
               role="button"
               (click)="selectAssembly(null)">
              All Items
              <span class="badge ms-1" [ngClass]="selectedAssemblyFilter === null ? 'bg-primary' : 'bg-secondary'">{{ selectedTemplate.items.length }}</span>
            </a>
          </li>
          <li *ngFor="let group of assemblyGroups" class="nav-item">
            <a class="nav-link"
               [class.active]="selectedAssemblyFilter === group.key"
               role="button"
               (click)="selectAssembly(group.key)">
              {{ group.name }}
              <span class="badge ms-1" [ngClass]="selectedAssemblyFilter === group.key ? 'bg-purple' : 'bg-secondary'">{{ group.count }}</span>
            </a>
          </li>
        </ul>
      </div>

      <!-- Active Filter Indicator -->
      <div *ngIf="hasMultipleAssemblies && selectedAssemblyFilter !== null" class="alert alert-light d-flex align-items-center gap-2 py-2 mb-3 border">
        <i class="bi bi-funnel text-purple"></i>
        <span>
          Showing <strong>{{ activeFilterName }}</strong>
          <span class="text-muted">({{ filteredTemplateItems.length }} items)</span>
        </span>
        <button class="btn btn-sm btn-outline-secondary ms-auto" (click)="selectAssembly(null)">
          <i class="bi bi-x-lg me-1"></i> Show All
        </button>
      </div>

      <!-- Items Table -->
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center gap-2">
          <h5 class="mb-0 flex-shrink-0">Template Items</h5>
          <div class="d-flex gap-2 align-items-center">
            <div class="input-group input-group-sm" style="max-width: 220px;" *ngIf="selectedTemplate.items.length > 0">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" placeholder="Search items..."
                     [(ngModel)]="templateItemSearch">
              <button *ngIf="templateItemSearch" class="btn btn-outline-secondary" (click)="templateItemSearch = ''">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <button class="btn btn-primary btn-sm flex-shrink-0" (click)="openAddItem()">
              <i class="bi bi-plus-lg me-1"></i> Add Item
            </button>
          </div>
        </div>
        <div class="card-body">
          <!-- Empty: no items in template at all -->
          <div *ngIf="selectedTemplate.items.length === 0" class="text-center py-5 text-muted">
            <i class="bi bi-file-earmark-text display-4 opacity-50 d-block mb-3"></i>
            <p>No items yet. Add parts to this template.</p>
          </div>

          <!-- Empty: items exist but filter/search yields nothing -->
          <div *ngIf="selectedTemplate.items.length > 0 && filteredTemplateItems.length === 0" class="text-center py-5 text-muted">
            <i class="bi bi-funnel display-4 opacity-50 d-block mb-3"></i>
            <p *ngIf="templateItemSearch">No items match "{{ templateItemSearch }}" in this view.</p>
            <p *ngIf="!templateItemSearch">No items in this assembly.</p>
            <button *ngIf="selectedAssemblyFilter !== null" class="btn btn-sm btn-outline-primary" (click)="selectAssembly(null)">
              Show All Items
            </button>
          </div>

          <div *ngIf="filteredTemplateItems.length > 0" class="table-responsive">
            <table class="table table-hover mb-0">
              <thead class="table-light">
                <tr>
                  <th>Part Number</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Location</th>
                  <th *ngIf="selectedAssemblyFilter === null || !hasMultipleAssemblies">Assembly Group</th>
                  <th class="text-center">Qty/Unit</th>
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                <ng-container *ngFor="let item of sortedFilteredItems; let idx = index">
                  <!-- Assembly Group Header Row (All Items view with multiple assemblies) -->
                  <tr *ngIf="selectedAssemblyFilter === null && hasMultipleAssemblies && shouldShowAssemblyHeader(item, idx)"
                      class="assembly-group-header">
                    <td [attr.colspan]="selectedAssemblyFilter === null || !hasMultipleAssemblies ? 7 : 6" class="py-2">
                      <div class="d-flex align-items-center gap-2">
                        <i class="bi" [ngClass]="item.assembly_group ? 'bi-box-seam text-purple' : 'bi-puzzle text-muted'"></i>
                        <strong>{{ item.assembly_group || 'Loose Parts' }}</strong>
                        <span class="badge bg-secondary">{{ getAssemblyGroupCount(item.assembly_group) }} parts</span>
                      </div>
                    </td>
                  </tr>

                  <!-- Item Row -->
                  <tr>
                    <td class="font-mono">{{ item.part_number }}</td>
                    <td>
                      <app-classification-badge
                        [classification]="getPartClassification(item.part_number)"
                        [size]="'sm'"
                      ></app-classification-badge>
                    </td>
                    <td class="text-muted">{{ item.description || '-' }}</td>
                    <td>{{ item.location || '-' }}</td>
                    <td *ngIf="selectedAssemblyFilter === null || !hasMultipleAssemblies" class="font-mono small text-muted">{{ item.assembly_group || '-' }}</td>
                    <td class="text-center">{{ item.qty_per_unit }}</td>
                    <td class="text-end">
                      <button
                        *ngIf="isAssemblyPart(item.part_number)"
                        class="btn btn-sm btn-outline-secondary me-1"
                        (click)="openBOMDialog(item)"
                        title="View exploded BOM"
                      >
                        <i class="bi bi-eye"></i>
                      </button>
                      <button class="btn btn-sm btn-outline-secondary me-1" (click)="openEditItem(item)">
                        <i class="bi bi-pencil"></i>
                      </button>
                      <button class="btn btn-sm btn-outline-danger" (click)="confirmDeleteItem(item)">
                        <i class="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                </ng-container>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- List View -->
    <ng-template #listView>
      <!-- Header -->
      <div class="page-header d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
        <div>
          <h1 class="page-title">Templates</h1>
          <p class="page-subtitle">Manage BOM templates for quick order creation</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" (click)="openExtractDialog()">
            <i class="bi bi-search me-1"></i> Extract from Orders
          </button>
          <button class="btn btn-primary" (click)="openCreateTemplate()">
            <i class="bi bi-plus-lg me-1"></i> New Template
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="card stat-card">
            <div class="card-body">
              <div class="stat-label">Total Templates</div>
              <div class="stat-value">{{ templates.length }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card stat-card">
            <div class="card-body">
              <div class="stat-label">BOM</div>
              <div class="stat-value">{{ bomCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card stat-card">
            <div class="card-body">
              <div class="stat-label">Assembly</div>
              <div class="stat-value">{{ assemblyCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card stat-card">
            <div class="card-body">
              <div class="stat-label">Tool Models</div>
              <div class="stat-value">{{ uniqueModels.length }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Type Filter Tabs -->
      <div class="d-flex gap-2 mb-4">
        <button class="btn btn-sm"
                [class.btn-primary]="typeFilter === 'all'"
                [class.btn-outline-secondary]="typeFilter !== 'all'"
                (click)="typeFilter = 'all'">
          All
          <span class="badge ms-1" [ngClass]="typeFilter === 'all' ? 'bg-light text-primary' : 'bg-secondary'">{{ templates.length }}</span>
        </button>
        <button class="btn btn-sm"
                [class.btn-primary]="typeFilter === 'bom'"
                [class.btn-outline-secondary]="typeFilter !== 'bom'"
                (click)="typeFilter = 'bom'">
          BOM
          <span class="badge ms-1" [ngClass]="typeFilter === 'bom' ? 'bg-light text-primary' : 'bg-secondary'">{{ bomCount }}</span>
        </button>
        <button class="btn btn-sm"
                [class.btn-primary]="typeFilter === 'assembly'"
                [class.btn-outline-secondary]="typeFilter !== 'assembly'"
                (click)="typeFilter = 'assembly'">
          Assembly
          <span class="badge ms-1" [ngClass]="typeFilter === 'assembly' ? 'bg-light text-primary' : 'bg-secondary'">{{ assemblyCount }}</span>
        </button>
      </div>

      <!-- Filters -->
      <div class="row g-3 mb-4">
        <div class="col-12 col-sm-8">
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="text" class="form-control" placeholder="Search templates..." [(ngModel)]="search">
            <button *ngIf="search" class="btn btn-outline-secondary" (click)="search = ''">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>
        <div class="col-12 col-sm-4">
          <select class="form-select" [(ngModel)]="modelFilter">
            <option value="all">All Models</option>
            <option *ngFor="let model of uniqueModels" [value]="model">{{ model }}</option>
          </select>
        </div>
      </div>

      <!-- Error -->
      <div *ngIf="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

      <!-- Loading -->
      <div *ngIf="isLoading" class="text-center py-5">
        <div class="spinner-border text-secondary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!isLoading && filteredTemplates.length === 0" class="card">
        <div class="card-body text-center py-5">
          <i class="bi bi-file-earmark-text display-4 text-muted opacity-50 d-block mb-3"></i>
          <p class="text-muted" *ngIf="templates.length === 0">No templates yet. Create one or extract from existing orders.</p>
          <p class="text-muted" *ngIf="templates.length > 0">No templates match your search.</p>
        </div>
      </div>

      <!-- Template Cards -->
      <div *ngIf="!isLoading && filteredTemplates.length > 0" class="d-flex flex-column gap-2">
        <div *ngFor="let tpl of filteredTemplates"
             class="card card-hover"
             role="button"
             (click)="handleSelectTemplate(tpl)">
          <div class="card-body d-flex align-items-center justify-content-between p-3">
            <div class="d-flex align-items-center gap-3 overflow-hidden">
              <i class="bi bi-file-earmark-text text-muted fs-5"></i>
              <div class="overflow-hidden">
                <div class="d-flex align-items-center gap-2">
                  <span class="fw-medium text-truncate">{{ tpl.name }}</span>
                  <span *ngIf="tpl.tool_model" class="badge bg-secondary">{{ tpl.tool_model }}</span>
                </div>
                <small class="text-muted">Created {{ tpl.created_at | date:'mediumDate' }}</small>
              </div>
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
              <button class="btn btn-sm btn-outline-secondary" (click)="$event.stopPropagation(); openEditTemplate(tpl)">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" (click)="$event.stopPropagation(); confirmDeleteTemplate(tpl)">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- Template Create/Edit Modal -->
    <div class="modal-backdrop fade show" *ngIf="showTemplateDialog" (click)="showTemplateDialog = false"></div>
    <div class="modal fade show d-block" *ngIf="showTemplateDialog" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingTemplate ? 'Edit Template' : 'New Template' }}</h5>
            <button type="button" class="btn-close" (click)="showTemplateDialog = false"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Template Name *</label>
              <input type="text" class="form-control" [(ngModel)]="templateForm.name" placeholder="e.g., 230Q BOM">
            </div>
            <div class="mb-3">
              <label class="form-label d-block">Template Type</label>
              <div class="d-flex gap-3">
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="templateType" id="typeBom" value="bom" [(ngModel)]="templateForm.template_type">
                  <label class="form-check-label" for="typeBom">
                    BOM (Bill of Materials)
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="templateType" id="typeAssembly" value="assembly" [(ngModel)]="templateForm.template_type">
                  <label class="form-check-label" for="typeAssembly">
                    Assembly
                  </label>
                </div>
              </div>
              <small class="text-muted">
                {{ templateForm.template_type === 'bom' ? 'Full bill of materials for a complete tool/product' : 'Component assembly template (e.g., Main Frame, Motor Assembly)' }}
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label">Tool Model</label>
              <input type="text" class="form-control" [(ngModel)]="templateForm.tool_model" placeholder="e.g., 230Q">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showTemplateDialog = false">Cancel</button>
            <button class="btn btn-primary" (click)="handleSaveTemplate()" [disabled]="!templateForm.name.trim()">
              {{ editingTemplate ? 'Save Changes' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Item Create/Edit Modal -->
    <div class="modal-backdrop fade show" *ngIf="showItemDialog" (click)="showItemDialog = false"></div>
    <div class="modal fade show d-block" *ngIf="showItemDialog" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingItem ? 'Edit Item' : 'Add Item' }}</h5>
            <button type="button" class="btn-close" (click)="showItemDialog = false"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Part Number *</label>
              <input type="text" class="form-control" [(ngModel)]="itemForm.part_number" placeholder="e.g., 12345-001">
            </div>
            <div class="mb-3">
              <label class="form-label">Description</label>
              <input type="text" class="form-control" [(ngModel)]="itemForm.description" placeholder="Part description">
            </div>
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label">Location</label>
                <input type="text" class="form-control" [(ngModel)]="itemForm.location" placeholder="e.g., A-1-2">
              </div>
              <div class="col-6">
                <label class="form-label">Qty per Unit</label>
                <input type="number" class="form-control" [(ngModel)]="itemForm.qty_per_unit" min="1">
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Assembly Group</label>
              <input type="text" class="form-control" [(ngModel)]="itemForm.assembly_group" placeholder="e.g., Main Frame">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showItemDialog = false">Cancel</button>
            <button class="btn btn-primary" (click)="handleSaveItem()" [disabled]="!itemForm.part_number.trim()">
              {{ editingItem ? 'Save Changes' : 'Add Item' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal-backdrop fade show" *ngIf="showDeleteDialog" (click)="showDeleteDialog = false"></div>
    <div class="modal fade show d-block" *ngIf="showDeleteDialog" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Delete {{ deleteTarget?.type === 'template' ? 'Template' : 'Item' }}</h5>
            <button type="button" class="btn-close" (click)="showDeleteDialog = false"></button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete "{{ deleteTarget?.name }}"?
              <span *ngIf="deleteTarget?.type === 'template'"> This will also delete all items in this template.</span>
              This action cannot be undone.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDeleteDialog = false">Cancel</button>
            <button class="btn btn-danger" (click)="handleDelete()">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Extract from Orders Modal -->
    <div class="modal-backdrop fade show" *ngIf="showExtractDialog" (click)="!extracting && (showExtractDialog = false)"></div>
    <div class="modal fade show d-block" *ngIf="showExtractDialog" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Extract Templates from Orders</h5>
            <button type="button" class="btn-close" (click)="showExtractDialog = false" [disabled]="extracting"></button>
          </div>
          <div class="modal-body">
            <p *ngIf="!extractResult && !extracting" class="text-muted">
              Scan all existing orders and create templates for each unique BOM. Duplicate BOMs (same parts and quantities) will be merged into a single template.
            </p>

            <div *ngIf="extracting" class="text-center py-4">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="text-muted mt-2">Extracting templates...</p>
            </div>

            <div *ngIf="extractResult">
              <div class="row g-3 mb-3">
                <div class="col-6">
                  <div class="p-3 rounded text-center" style="background-color: rgba(25, 135, 84, 0.1);">
                    <div class="h4 fw-bold text-success mb-0">{{ extractResult.created }}</div>
                    <small class="text-muted">Created</small>
                  </div>
                </div>
                <div class="col-6">
                  <div class="p-3 bg-body-secondary rounded text-center">
                    <div class="h4 fw-bold mb-0">{{ extractResult.skipped }}</div>
                    <small class="text-muted">Skipped (duplicates)</small>
                  </div>
                </div>
              </div>
              <div *ngIf="extractResult.errors.length > 0" class="alert alert-danger">
                <strong>Errors:</strong>
                <ul class="mb-0 ps-3">
                  <li *ngFor="let err of extractResult.errors">{{ err }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button *ngIf="extractResult" class="btn btn-primary" (click)="showExtractDialog = false">Done</button>
            <ng-container *ngIf="!extractResult">
              <button class="btn btn-secondary" (click)="showExtractDialog = false" [disabled]="extracting">Cancel</button>
              <button class="btn btn-primary" (click)="handleExtract()" [disabled]="extracting">
                {{ extracting ? 'Extracting...' : 'Extract' }}
              </button>
            </ng-container>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .font-mono {
      font-family: monospace;
    }

    .card-hover:hover {
      background-color: var(--bs-tertiary-bg);
      cursor: pointer;
    }

    /* Assembly cards */
    .assembly-card {
      transition: border-color 0.15s, box-shadow 0.15s;
      cursor: pointer;
    }

    .assembly-card:hover {
      background-color: var(--bs-tertiary-bg);
    }

    .border-purple {
      border-color: var(--color-purple) !important;
    }

    /* Override global icon-circle for template scope (already defined globally) */

    /* Purple theme */
    .text-purple {
      color: var(--color-purple);
    }

    .bg-purple {
      background-color: var(--color-purple) !important;
    }

    /* Assembly group header rows */
    .assembly-group-header td {
      background-color: var(--color-purple-subtle) !important;
      border-left: 3px solid var(--color-purple);
    }

    /* Tab bar horizontal scroll */
    .nav-tabs-scroll {
      overflow-x: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .nav-tabs-scroll::-webkit-scrollbar {
      display: none;
    }

    .nav-tabs-scroll .nav-tabs {
      white-space: nowrap;
    }

    .nav-tabs-scroll .nav-link {
      white-space: nowrap;
    }
  `]
})
export class TemplatesComponent implements OnInit, OnDestroy {
  templates: BOMTemplate[] = [];
  isLoading = true;
  errorMsg: string | null = null;

  // View state
  selectedTemplate: BOMTemplateWithItems | null = null;

  // Filters
  search = '';
  modelFilter = 'all';
  typeFilter: 'all' | 'bom' | 'assembly' = 'all';

  // Assembly navigation
  selectedAssemblyFilter: string | null = null;  // null="All", '__unassigned__'=loose parts, or assembly name
  templateItemSearch = '';

  // Template dialog
  showTemplateDialog = false;
  editingTemplate: BOMTemplate | null = null;
  templateForm = { name: '', tool_model: '', template_type: 'bom' as 'bom' | 'assembly' };

  // Item dialog
  showItemDialog = false;
  editingItem: BOMTemplateItem | null = null;
  itemForm = { part_number: '', description: '', location: '', assembly_group: '', qty_per_unit: 1 };

  // Delete dialog
  showDeleteDialog = false;
  deleteTarget: { type: 'template' | 'item'; id: string; name: string } | null = null;

  // Extract dialog
  showExtractDialog = false;
  extracting = false;
  extractResult: { created: number; skipped: number; errors: string[] } | null = null;

  // Parts data
  partsMap = new Map<string, Part>();

  private subscriptions: Subscription[] = [];

  constructor(
    private bomTemplatesService: BomTemplatesService,
    private partsService: PartsService,
    private modalService: NgbModal
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.bomTemplatesService.templates$.subscribe(t => this.templates = t),
      this.bomTemplatesService.loading$.subscribe(l => this.isLoading = l),
      this.bomTemplatesService.error$.subscribe(e => this.errorMsg = e),
      this.partsService.parts$.subscribe(parts => {
        this.partsMap = new Map(parts.map(p => [p.part_number, p]));
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  // --- Assembly navigation getters ---

  get assemblyGroups(): AssemblyGroup[] {
    if (!this.selectedTemplate) return [];
    const groups = new Map<string, number>();
    let unassignedCount = 0;

    for (const item of this.selectedTemplate.items) {
      if (item.assembly_group) {
        groups.set(item.assembly_group, (groups.get(item.assembly_group) || 0) + 1);
      } else {
        unassignedCount++;
      }
    }

    const result: AssemblyGroup[] = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, key: name, count }));

    if (unassignedCount > 0) {
      result.push({ name: 'Loose Parts', key: '__unassigned__', count: unassignedCount });
    }

    return result;
  }

  get hasMultipleAssemblies(): boolean {
    return this.assemblyGroups.length > 1;
  }

  get activeFilterName(): string {
    if (this.selectedAssemblyFilter === null) return 'All Items';
    if (this.selectedAssemblyFilter === '__unassigned__') return 'Loose Parts';
    return this.selectedAssemblyFilter;
  }

  get filteredTemplateItems(): BOMTemplateItem[] {
    if (!this.selectedTemplate) return [];
    let items = this.selectedTemplate.items;

    // Filter by assembly
    if (this.selectedAssemblyFilter !== null) {
      if (this.selectedAssemblyFilter === '__unassigned__') {
        items = items.filter(i => !i.assembly_group);
      } else {
        items = items.filter(i => i.assembly_group === this.selectedAssemblyFilter);
      }
    }

    // Filter by search
    if (this.templateItemSearch.trim()) {
      const q = this.templateItemSearch.toLowerCase().trim();
      items = items.filter(i =>
        i.part_number.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.location && i.location.toLowerCase().includes(q))
      );
    }

    return items;
  }

  get sortedFilteredItems(): BOMTemplateItem[] {
    const items = [...this.filteredTemplateItems];

    // When showing "All Items" with multiple assemblies, sort by assembly_group for group headers
    if (this.selectedAssemblyFilter === null && this.hasMultipleAssemblies) {
      items.sort((a, b) => {
        const aGroup = a.assembly_group || '';
        const bGroup = b.assembly_group || '';
        // Named groups first (alphabetical), then unassigned last
        if (!aGroup && bGroup) return 1;
        if (aGroup && !bGroup) return -1;
        return aGroup.localeCompare(bGroup);
      });
    }

    return items;
  }

  // --- Assembly navigation methods ---

  selectAssembly(key: string | null): void {
    this.selectedAssemblyFilter = key;
  }

  shouldShowAssemblyHeader(item: BOMTemplateItem, index: number): boolean {
    if (index === 0) return true;
    const items = this.sortedFilteredItems;
    const prevItem = items[index - 1];
    return (item.assembly_group || '') !== (prevItem.assembly_group || '');
  }

  getAssemblyGroupCount(assemblyGroup: string | null): number {
    if (!this.selectedTemplate) return 0;
    const group = assemblyGroup || '';
    return this.selectedTemplate.items.filter(i => (i.assembly_group || '') === group).length;
  }

  // --- Existing getters ---

  get uniqueModels(): string[] {
    const models = new Set<string>();
    for (const t of this.templates) {
      if (t.tool_model) models.add(t.tool_model);
    }
    return Array.from(models).sort();
  }

  get bomCount(): number {
    return this.templates.filter(t => !t.template_type || t.template_type === 'bom').length;
  }

  get assemblyCount(): number {
    return this.templates.filter(t => t.template_type === 'assembly').length;
  }

  get filteredTemplates(): BOMTemplate[] {
    return this.templates.filter(t => {
      const matchesSearch = !this.search ||
        t.name.toLowerCase().includes(this.search.toLowerCase()) ||
        (t.tool_model && t.tool_model.toLowerCase().includes(this.search.toLowerCase()));
      const matchesModel = this.modelFilter === 'all' || t.tool_model === this.modelFilter;
      const matchesType = this.typeFilter === 'all' ||
        (this.typeFilter === 'bom' && (!t.template_type || t.template_type === 'bom')) ||
        (this.typeFilter === 'assembly' && t.template_type === 'assembly');
      return matchesSearch && matchesModel && matchesType;
    });
  }

  async handleSelectTemplate(template: BOMTemplate): Promise<void> {
    const detail = await this.bomTemplatesService.getTemplateWithItems(template.id);
    this.selectedTemplate = detail;
    this.selectedAssemblyFilter = null;
    this.templateItemSearch = '';
  }

  private async refreshDetail(): Promise<void> {
    if (this.selectedTemplate) {
      const detail = await this.bomTemplatesService.getTemplateWithItems(this.selectedTemplate.id);
      this.selectedTemplate = detail;
    }
  }

  // Template CRUD
  openCreateTemplate(): void {
    this.editingTemplate = null;
    this.templateForm = { name: '', tool_model: '', template_type: 'bom' };
    this.showTemplateDialog = true;
  }

  openEditTemplate(t: BOMTemplate): void {
    this.editingTemplate = t;
    this.templateForm = { name: t.name, tool_model: t.tool_model || '', template_type: t.template_type || 'bom' };
    this.showTemplateDialog = true;
  }

  async handleSaveTemplate(): Promise<void> {
    if (!this.templateForm.name.trim()) return;

    if (this.editingTemplate) {
      await this.bomTemplatesService.updateTemplate(this.editingTemplate.id, {
        name: this.templateForm.name.trim(),
        tool_model: this.templateForm.tool_model.trim() || null,
      });
      if (this.selectedTemplate?.id === this.editingTemplate.id) {
        await this.refreshDetail();
      }
    } else {
      await this.bomTemplatesService.createTemplate(
        this.templateForm.name.trim(),
        this.templateForm.tool_model.trim() || undefined,
        this.templateForm.template_type
      );
    }

    this.showTemplateDialog = false;
  }

  confirmDeleteTemplate(t: BOMTemplate): void {
    this.deleteTarget = { type: 'template', id: t.id, name: t.name };
    this.showDeleteDialog = true;
  }

  confirmDeleteItem(item: BOMTemplateItem): void {
    this.deleteTarget = { type: 'item', id: item.id, name: item.part_number };
    this.showDeleteDialog = true;
  }

  async handleDelete(): Promise<void> {
    if (!this.deleteTarget) return;

    if (this.deleteTarget.type === 'template') {
      await this.bomTemplatesService.deleteTemplate(this.deleteTarget.id);
      if (this.selectedTemplate?.id === this.deleteTarget.id) {
        this.selectedTemplate = null;
      }
    } else {
      await this.bomTemplatesService.deleteTemplateItem(this.deleteTarget.id);
      await this.refreshDetail();
    }

    this.showDeleteDialog = false;
    this.deleteTarget = null;
  }

  // Item CRUD
  openAddItem(): void {
    this.editingItem = null;
    // Pre-fill assembly_group from current filter
    let prefillAssembly = '';
    if (this.selectedAssemblyFilter && this.selectedAssemblyFilter !== '__unassigned__') {
      prefillAssembly = this.selectedAssemblyFilter;
    }
    this.itemForm = { part_number: '', description: '', location: '', assembly_group: prefillAssembly, qty_per_unit: 1 };
    this.showItemDialog = true;
  }

  openEditItem(item: BOMTemplateItem): void {
    this.editingItem = item;
    this.itemForm = {
      part_number: item.part_number,
      description: item.description || '',
      location: item.location || '',
      assembly_group: item.assembly_group || '',
      qty_per_unit: item.qty_per_unit,
    };
    this.showItemDialog = true;
  }

  async handleSaveItem(): Promise<void> {
    if (!this.selectedTemplate || !this.itemForm.part_number.trim()) return;

    if (this.editingItem) {
      await this.bomTemplatesService.updateTemplateItem(this.editingItem.id, {
        part_number: this.itemForm.part_number.trim(),
        description: this.itemForm.description.trim() || null,
        location: this.itemForm.location.trim() || null,
        assembly_group: this.itemForm.assembly_group.trim() || null,
        qty_per_unit: this.itemForm.qty_per_unit,
      });
    } else {
      await this.bomTemplatesService.addTemplateItem(this.selectedTemplate.id, {
        part_number: this.itemForm.part_number.trim(),
        description: this.itemForm.description.trim() || null,
        location: this.itemForm.location.trim() || null,
        assembly_group: this.itemForm.assembly_group.trim() || null,
        qty_per_unit: this.itemForm.qty_per_unit,
      });
    }

    this.showItemDialog = false;
    await this.refreshDetail();
  }

  // Extract from orders
  openExtractDialog(): void {
    this.extractResult = null;
    this.showExtractDialog = true;
  }

  async handleExtract(): Promise<void> {
    this.extracting = true;
    this.extractResult = null;
    this.extractResult = await this.bomTemplatesService.extractTemplatesFromOrders();
    this.extracting = false;
  }

  // Parts integration methods
  getPartClassification(partNumber: string) {
    return this.partsMap.get(partNumber)?.classification_type || null;
  }

  isAssemblyPart(partNumber: string): boolean {
    return this.partsMap.get(partNumber)?.classification_type === 'assembly';
  }

  openBOMDialog(item: BOMTemplateItem): void {
    const part = this.partsMap.get(item.part_number);
    if (part) {
      const modalRef = this.modalService.open(ExplodedBOMDialogComponent, {
        size: 'lg',
        scrollable: true
      });
      modalRef.componentInstance.partId = part.id;
      modalRef.componentInstance.partNumber = item.part_number;
      modalRef.componentInstance.partDescription = item.description;
    }
  }
}
