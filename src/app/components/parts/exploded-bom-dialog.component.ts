import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PartsService } from '../../services/parts.service';
import { ExplodedPart } from '../../models';
import { ClassificationBadgeComponent } from './classification-badge.component';

@Component({
  selector: 'app-exploded-bom-dialog',
  standalone: true,
  imports: [CommonModule, ClassificationBadgeComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title">
        <i class="bi bi-boxes me-2 text-secondary"></i>
        Exploded BOM
      </h5>
      <button type="button" class="btn-close" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <div class="mb-3">
        <div class="font-monospace fw-semibold">{{ partNumber }}</div>
        <div *ngIf="partDescription" class="small text-muted">{{ partDescription }}</div>
      </div>

      <div *ngIf="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div *ngIf="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div *ngIf="!loading && !error && explodedParts.length === 0" class="text-center py-5 text-muted">
        <i class="bi bi-box-seam display-4 opacity-50"></i>
        <p class="mt-3">This assembly has no components.</p>
      </div>

      <div *ngIf="!loading && !error && explodedParts.length > 0">
        <!-- Summary Stats -->
        <div class="row g-3 mb-3">
          <div class="col-4 text-center">
            <div class="display-6 fw-bold">{{ totalParts }}</div>
            <div class="small text-muted">Unique Parts</div>
          </div>
          <div class="col-4 text-center">
            <div class="display-6 fw-bold">{{ totalQuantity }}</div>
            <div class="small text-muted">Total Quantity</div>
          </div>
          <div class="col-4 text-center">
            <div class="display-6 fw-bold">{{ maxDepth }}</div>
            <div class="small text-muted">Max Depth</div>
          </div>
        </div>

        <!-- Parts Table -->
        <div class="table-responsive border rounded">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>Part Number</th>
                <th>Description</th>
                <th>Type</th>
                <th class="text-center">Qty</th>
                <th class="text-center">Level</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let part of explodedParts">
                <td class="font-monospace">{{ part.part_number }}</td>
                <td class="text-muted small">{{ part.description || '-' }}</td>
                <td>
                  <app-classification-badge
                    [classification]="part.classification_type"
                    [size]="'sm'"
                  ></app-classification-badge>
                </td>
                <td class="text-center fw-medium">{{ part.total_quantity }}</td>
                <td class="text-center">
                  <span class="badge bg-secondary">L{{ part.max_level }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="text-center text-muted small mt-3 pt-3 border-top">
          Level 0 = direct children, Level 1+ = nested subassemblies
        </div>
      </div>
    </div>
  `
})
export class ExplodedBOMDialogComponent implements OnInit {
  @Input() partId: string = '';
  @Input() partNumber: string = '';
  @Input() partDescription?: string | null;

  explodedParts: ExplodedPart[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    public activeModal: NgbActiveModal,
    private partsService: PartsService
  ) {}

  async ngOnInit(): Promise<void> {
    if (this.partId) {
      await this.fetchExplodedBOM();
    }
  }

  async fetchExplodedBOM(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      this.explodedParts = await this.partsService.getExplodedBOM(this.partId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load BOM';
    } finally {
      this.loading = false;
    }
  }

  get totalParts(): number {
    return this.explodedParts.length;
  }

  get totalQuantity(): number {
    return this.explodedParts.reduce((sum, p) => sum + p.total_quantity, 0);
  }

  get maxDepth(): number {
    return this.explodedParts.length > 0
      ? Math.max(...this.explodedParts.map(p => p.max_level))
      : 0;
  }
}
