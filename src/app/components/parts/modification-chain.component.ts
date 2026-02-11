import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PartsService } from '../../services/parts.service';
import { ModificationChainItem } from '../../models';
import { ClassificationBadgeComponent } from './classification-badge.component';

@Component({
  selector: 'app-modification-chain',
  standalone: true,
  imports: [CommonModule, ClassificationBadgeComponent],
  template: `
    <div *ngIf="loading" class="text-center py-4">
      <div class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div *ngIf="!loading && chain.length > 1" class="card">
      <div class="card-header">
        <h5 class="card-title mb-0">Modification History</h5>
      </div>
      <div class="card-body">
        <!-- Visual Timeline -->
        <div class="d-flex align-items-center gap-2 flex-wrap mb-4">
          <ng-container *ngFor="let item of chain; let idx = index">
            <div [class.ring-primary]="item.part.id === partId" class="border rounded p-2">
              <div class="d-flex align-items-center gap-2">
                <i class="bi bi-box-seam text-muted"></i>
                <div>
                  <div class="small font-monospace fw-medium">{{ item.part.part_number }}</div>
                  <span *ngIf="item.level === 0" class="badge bg-primary mt-1">Original</span>
                  <span *ngIf="item.level > 0" class="badge bg-info text-dark mt-1">v{{ item.level }}</span>
                </div>
              </div>
            </div>
            <i *ngIf="idx < chain.length - 1" class="bi bi-arrow-right text-muted"></i>
          </ng-container>
        </div>

        <!-- Detailed List -->
        <div class="list-group">
          <div *ngFor="let item of chain"
               [class.bg-light]="item.part.id === partId"
               [class.border-primary]="item.part.id === partId"
               class="list-group-item">
            <div class="d-flex justify-content-between align-items-start">
              <div class="d-flex align-items-start gap-2">
                <i class="bi bi-box-seam text-muted mt-1"></i>
                <div>
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="font-monospace fw-medium">{{ item.part.part_number }}</span>
                    <span *ngIf="item.level === 0" class="badge bg-primary">Original</span>
                    <span *ngIf="item.level > 0" class="badge bg-info text-dark">Modified v{{ item.level }}</span>
                    <span *ngIf="item.part.id === partId" class="badge bg-success">Current</span>
                  </div>
                  <div *ngIf="item.part.description" class="small text-muted mt-1">
                    {{ item.part.description }}
                  </div>
                </div>
              </div>
              <div *ngIf="item.part.default_location" class="text-muted small">
                📍 {{ item.part.default_location }}
              </div>
            </div>
            <div *ngIf="item.part.notes" class="small text-muted mt-2 ps-4">
              Note: {{ item.part.notes }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ring-primary {
      box-shadow: 0 0 0 2px var(--bs-primary);
    }
  `]
})
export class ModificationChainComponent implements OnInit {
  @Input() partId: string = '';

  chain: ModificationChainItem[] = [];
  loading = true;

  constructor(private partsService: PartsService) {}

  async ngOnInit(): Promise<void> {
    if (this.partId) {
      await this.loadChain();
    }
  }

  async loadChain(): Promise<void> {
    this.loading = true;
    // The service will call get_modification_chain RPC function
    this.chain = await this.partsService.getModificationChain(this.partId);
    this.loading = false;
  }
}
