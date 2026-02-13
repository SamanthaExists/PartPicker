import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PartsService } from '../../services/parts.service';
import { Part, PartWithStats, ClassificationType } from '../../models';
import { PartDetailComponent } from '../../components/parts/part-detail.component';
import { SupabaseService } from '../../services/supabase.service';
import { UtilsService } from '../../services/utils.service';
import { ToastService } from '../../services/toast.service';

type PartSortOption = 'part-number' | 'description' | 'classification' | 'location';

@Component({
  selector: 'app-parts-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="container-fluid py-3">
      <!-- Header -->
      <div class="page-header d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
        <div>
          <h1 class="page-title">Parts Catalog</h1>
          <p class="page-subtitle">Manage your parts catalog with classifications and relationships</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary">
            <i class="bi bi-download me-1"></i> Export
          </button>
          <button
            class="btn btn-outline-primary"
            (click)="handleAutoDetectAssemblies()"
            [disabled]="autoDetecting">
            <i class="bi bi-lightning-charge me-1"></i>
            {{ autoDetecting ? 'Detecting...' : 'Auto-Detect Assemblies' }}
          </button>
          <button class="btn btn-primary" (click)="showNewPartDialog()">
            <i class="bi bi-plus-lg me-1"></i> New Part
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card filter-bar">
        <div class="card-body">
          <div class="row g-3">
            <!-- Search -->
            <div class="col-md-4">
              <input
                type="search"
                class="form-control"
                placeholder="Search by part number, description, or location..."
                [(ngModel)]="searchQuery"
                (ngModelChange)="applyFilters()"
              />
            </div>

            <!-- Classification Filter -->
            <div class="col-md-4">
              <select class="form-select" [(ngModel)]="classificationFilter" (ngModelChange)="applyFilters()">
                <option value="all">All Classifications</option>
                <option value="purchased">Purchased</option>
                <option value="manufactured">Manufactured</option>
                <option value="assembly">Assembly</option>
                <option value="modified">Modified</option>
              </select>
            </div>

            <!-- Sort -->
            <div class="col-md-4">
              <select class="form-select" [(ngModel)]="sortBy" (ngModelChange)="applyFilters()">
                <option value="part-number">Sort by Part Number</option>
                <option value="description">Sort by Description</option>
                <option value="classification">Sort by Classification</option>
                <option value="location">Sort by Location</option>
              </select>
            </div>
          </div>

          <div class="mt-2">
            <small class="text-muted">
              {{ filteredParts.length }} part(s)
            </small>
          </div>
        </div>
      </div>

      <!-- Parts List -->
      <div *ngIf="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="text-muted mt-3">Loading parts...</p>
      </div>

      <div *ngIf="!loading && filteredParts.length === 0" class="card">
        <div class="card-body text-center py-5">
          <p class="text-muted">
            {{ searchQuery || classificationFilter !== 'all' ? 'No parts match your filters' : 'No parts yet. Create one to get started.' }}
          </p>
          <button *ngIf="!searchQuery && classificationFilter === 'all'" class="btn btn-primary mt-2" (click)="showNewPartDialog()">
            Create Part
          </button>
        </div>
      </div>

      <div *ngIf="!loading && filteredParts.length > 0" class="row g-3">
        <div *ngFor="let part of filteredParts" class="col-12">
          <div class="card hover-shadow" style="cursor: pointer;" (click)="openPartDetail(part.id)">
            <div class="card-body py-3">
              <div class="row g-3 align-items-center">
                <!-- Part Number & Classification -->
                <div class="col-12 col-sm-3 col-lg-2">
                  <div class="d-flex align-items-center gap-2">
                    <div class="font-monospace fw-semibold">{{ part.part_number }}</div>
                    <button class="btn btn-sm btn-ghost-secondary p-0" (click)="copyPartNumber(part.part_number, $event)" title="Copy Part Number">
                      <i class="bi" [ngClass]="copiedPartNumber === part.part_number ? 'bi-check-lg text-success' : 'bi-copy'"></i>
                    </button>
                  </div>
                  <span *ngIf="part.classification_type" [class]="getClassificationBadgeClass(part.classification_type) + ' mt-1'">
                    {{ getClassificationLabel(part.classification_type) }}
                  </span>
                </div>

                <!-- Description -->
                <div class="col-12 col-sm-4 col-lg-3">
                  <div class="small text-muted text-truncate-2">
                    <span *ngIf="part.description">{{ part.description }}</span>
                    <span *ngIf="!part.description" class="fst-italic">No description</span>
                  </div>
                </div>

                <!-- Location -->
                <div class="col-6 col-sm-2 col-lg-2">
                  <div class="small text-muted" style="font-size: 0.75rem;">Location</div>
                  <div class="small fw-medium">
                    <span *ngIf="part.default_location">{{ part.default_location }}</span>
                    <span *ngIf="!part.default_location" class="text-muted fst-italic">—</span>
                  </div>
                </div>

                <!-- BOM Stats -->
                <div class="col-6 col-sm-2 col-lg-2">
                  <div class="small text-muted" style="font-size: 0.75rem;">BOM</div>
                  <div class="small">
                    <span *ngIf="part.child_count > 0" class="fw-medium">{{ part.child_count }} parts</span>
                    <span *ngIf="part.used_in_count > 0 && part.child_count > 0" class="text-muted"> • </span>
                    <span *ngIf="part.used_in_count > 0" class="text-muted">{{ part.used_in_count }} assy</span>
                    <span *ngIf="part.child_count === 0 && part.used_in_count === 0" class="text-muted fst-italic">—</span>
                  </div>
                </div>

                <!-- Dates -->
                <div class="col-6 col-sm-2 col-lg-2">
                  <div class="small text-muted" style="font-size: 0.75rem;">Updated</div>
                  <div class="small">{{ part.updated_at | date:'shortDate' }}</div>
                </div>

                <!-- Edit Button -->
                <div class="col-6 col-sm-1 col-lg-1 text-end">
                  <button class="btn btn-sm btn-ghost-secondary" (click)="openPartDetail(part.id); $event.stopPropagation()">
                    <i class="bi bi-pencil"></i>
                  </button>
                </div>
              </div>

              <!-- Notes Row (if present) -->
              <div *ngIf="part.notes" class="row mt-3 pt-3 border-top">
                <div class="col-12">
                  <div class="small text-muted">
                    <span class="fw-medium">Notes:</span> {{ part.notes }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .hover-shadow {
      transition: box-shadow var(--transition-base, 0.2s ease);
    }
    .hover-shadow:hover {
      box-shadow: var(--shadow-md);
    }
    .min-w-0 {
      min-width: 0;
    }
    .btn-ghost-secondary {
      color: var(--text-muted);
      background-color: transparent;
      border: none;
    }
    .btn-ghost-secondary:hover {
      color: var(--text-secondary);
      background-color: var(--surface-inset);
    }
  `]
})
export class PartsCatalogComponent implements OnInit, OnDestroy {
  parts: PartWithStats[] = [];
  filteredParts: PartWithStats[] = [];
  loading = true;
  searchQuery = '';
  classificationFilter: ClassificationType | 'all' = 'all';
  sortBy: PartSortOption = 'part-number';
  autoDetecting = false;
  autoDetectResults: Array<{
    assembly_name: string;
    components_count: number;
    created_relationships: number;
  }> | null = null;

  copiedPartNumber: string | null = null;

  private subscription?: Subscription;

  constructor(
    private partsService: PartsService,
    private modalService: NgbModal,
    private supabaseService: SupabaseService,
    private utils: UtilsService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.subscription = this.partsService.parts$.subscribe((parts) => {
      this.parts = parts;
      this.applyFilters();
    });

    this.partsService.loading$.subscribe((loading) => {
      this.loading = loading;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  applyFilters(): void {
    let filtered = [...this.parts];

    // Search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter((part) =>
        part.part_number.toLowerCase().includes(query) ||
        part.description?.toLowerCase().includes(query) ||
        part.default_location?.toLowerCase().includes(query)
      );
    }

    // Classification filter
    if (this.classificationFilter !== 'all') {
      filtered = filtered.filter((part) => part.classification_type === this.classificationFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'part-number':
          return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
        case 'description':
          return (a.description || '').localeCompare(b.description || '');
        case 'classification':
          return (a.classification_type || '').localeCompare(b.classification_type || '');
        case 'location':
          return (a.default_location || '').localeCompare(b.default_location || '');
        default:
          return 0;
      }
    });

    this.filteredParts = filtered;
  }

  getClassificationLabel(type: ClassificationType): string {
    const labels: Record<ClassificationType, string> = {
      purchased: 'Purchased',
      manufactured: 'Manufactured',
      assembly: 'Assembly',
      modified: 'Modified'
    };
    return labels[type];
  }

  getClassificationBadgeClass(type: ClassificationType): string {
    const classes: Record<ClassificationType, string> = {
      purchased: 'badge bg-primary',
      manufactured: 'badge bg-warning text-dark',
      assembly: 'badge bg-secondary',
      modified: 'badge bg-info text-dark'
    };
    return classes[type];
  }

  showNewPartDialog(): void {
    const modalRef = this.modalService.open(PartDetailComponent, {
      size: 'xl',
      backdrop: 'static'
    });
    modalRef.componentInstance.isNew = true;
  }

  openPartDetail(partId: string): void {
    const modalRef = this.modalService.open(PartDetailComponent, {
      size: 'xl',
      backdrop: 'static'
    });
    modalRef.componentInstance.partId = partId;
  }

  async handleAutoDetectAssemblies(): Promise<void> {
    try {
      this.autoDetecting = true;
      const { data, error } = await this.supabaseService.rpc('auto_detect_assemblies_from_orders', {});

      if (error) throw error;

      this.autoDetectResults = data || [];
      this.partsService.refetch(); // Refresh parts list

      // Show results modal
      const modalRef = this.modalService.open(AutoDetectResultsModal, { size: 'lg' });
      modalRef.componentInstance.results = this.autoDetectResults;
    } catch (error) {
      console.error('Error auto-detecting assemblies:', error);
      this.toast.error('Failed to auto-detect assemblies. Please try again.');
    } finally {
      this.autoDetecting = false;
    }
  }

  async copyPartNumber(partNumber: string, event: Event): Promise<void> {
    event.stopPropagation();
    const success = await this.utils.copyToClipboard(partNumber);
    if (success) {
      this.copiedPartNumber = partNumber;
      setTimeout(() => {
        if (this.copiedPartNumber === partNumber) {
          this.copiedPartNumber = null;
        }
      }, 2000);
    }
  }
}

// Auto-Detect Results Modal Component
@Component({
  selector: 'app-auto-detect-results-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title">Auto-Detect Assemblies Results</h5>
      <button type="button" class="btn-close" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <div *ngIf="results && results.length > 0; else noResults">
        <p class="text-muted">Found {{ results.length }} assemblies from existing orders:</p>
        <div class="list-group">
          <div *ngFor="let result of results" class="list-group-item">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-1">{{ result.assembly_name }}</h6>
                <small class="text-muted">
                  {{ result.components_count }} components, {{ result.created_relationships }} new relationships created
                </small>
              </div>
              <span class="badge bg-secondary">{{ result.components_count }}</span>
            </div>
          </div>
        </div>
      </div>
      <ng-template #noResults>
        <p class="text-center text-muted py-5">No assemblies found in existing orders.</p>
      </ng-template>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Close</button>
    </div>
  `
})
class AutoDetectResultsModal {
  results: Array<{
    assembly_name: string;
    components_count: number;
    created_relationships: number;
  }> | null = null;

  constructor(public activeModal: NgbActiveModal) { }
}
