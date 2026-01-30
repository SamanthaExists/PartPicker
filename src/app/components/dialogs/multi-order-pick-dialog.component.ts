import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConsolidatedPart } from '../../models';

interface OrderAllocation {
  orderId: string;
  soNumber: string;
  lineItemId: string;
  needed: number;
  picked: number;
  remaining: number;
  allocatedQty: number;
}

@Component({
  selector: 'app-multi-order-pick-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-box-seam me-2"></i>Pick Across Orders
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body" *ngIf="part">
            <div class="mb-3">
              <strong class="font-monospace fs-5">{{ part.part_number }}</strong>
              <p class="text-muted small mb-0" *ngIf="part.description">{{ part.description }}</p>
              <span class="badge bg-secondary" *ngIf="part.location">{{ part.location }}</span>
            </div>

            <div class="alert alert-info small mb-3">
              <div class="row">
                <div class="col-4">
                  <span class="text-muted">Total Needed:</span>
                  <strong class="ms-1">{{ part.total_needed }}</strong>
                </div>
                <div class="col-4">
                  <span class="text-muted">Picked:</span>
                  <strong class="ms-1">{{ part.total_picked }}</strong>
                </div>
                <div class="col-4">
                  <span class="text-muted">Remaining:</span>
                  <strong class="ms-1">{{ part.remaining }}</strong>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Available to Pick</label>
              <input
                type="number"
                class="form-control"
                [(ngModel)]="availableToPick"
                [min]="0"
                (change)="onAvailableChange()"
              >
              <div class="form-text">Enter the quantity you have available to distribute across orders</div>
            </div>

            <hr>

            <h6>Allocate to Orders</h6>
            <div class="d-flex flex-column gap-2">
              <div *ngFor="let alloc of allocations" class="d-flex align-items-center gap-2 p-2 border rounded">
                <div class="flex-grow-1">
                  <a [routerLink]="['/orders', alloc.orderId]" class="text-decoration-none fw-medium">
                    SO-{{ alloc.soNumber }}
                  </a>
                  <span class="small text-muted ms-2">
                    ({{ alloc.picked }}/{{ alloc.needed }} picked)
                  </span>
                  <span *ngIf="alloc.remaining === 0" class="badge bg-success ms-1">Complete</span>
                </div>
                <div class="input-group" style="width: 160px;">
                  <button
                    class="btn btn-outline-secondary btn-sm"
                    type="button"
                    (click)="decrementAllocation(alloc)"
                    [disabled]="alloc.allocatedQty <= 0"
                  >
                    <i class="bi bi-dash"></i>
                  </button>
                  <input
                    type="number"
                    class="form-control form-control-sm text-center"
                    [(ngModel)]="alloc.allocatedQty"
                    [min]="0"
                    [max]="alloc.remaining"
                    [disabled]="alloc.remaining === 0"
                  >
                  <button
                    class="btn btn-outline-secondary btn-sm"
                    type="button"
                    (click)="incrementAllocation(alloc)"
                    [disabled]="alloc.allocatedQty >= alloc.remaining || totalAllocated >= availableToPick"
                  >
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="d-flex justify-content-between mt-3">
              <div>
                <button class="btn btn-sm btn-outline-secondary me-1" (click)="distributeEvenly()">
                  Distribute Evenly
                </button>
                <button class="btn btn-sm btn-outline-secondary me-1" (click)="fillInOrder()">
                  Fill In Order
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="clearAllocations()">
                  Clear
                </button>
              </div>
              <div class="text-end">
                <span class="small text-muted">Allocated:</span>
                <strong class="ms-1" [class.text-danger]="totalAllocated > availableToPick">
                  {{ totalAllocated }}/{{ availableToPick }}
                </strong>
              </div>
            </div>

            <div *ngIf="totalAllocated > availableToPick" class="alert alert-danger small mt-3 mb-0">
              <i class="bi bi-exclamation-triangle me-1"></i>
              Allocated quantity exceeds available inventory!
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="totalAllocated === 0 || totalAllocated > availableToPick || saving"
              (click)="save()"
            >
              <i class="bi me-1" [class]="saving ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
              {{ saving ? 'Picking...' : 'Apply Picks' }}
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
export class MultiOrderPickDialogComponent implements OnChanges {
  @Input() show = false;
  @Input() part: ConsolidatedPart | null = null;

  @Output() showChange = new EventEmitter<boolean>();
  @Output() pick = new EventEmitter<{ lineItemId: string; qty: number }[]>();

  allocations: OrderAllocation[] = [];
  availableToPick = 0;
  saving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show && this.part) {
      this.initializeAllocations();
    }
  }

  private initializeAllocations(): void {
    if (!this.part) return;

    this.availableToPick = this.part.remaining;

    this.allocations = this.part.orders.map(order => ({
      orderId: order.order_id,
      soNumber: order.so_number,
      lineItemId: order.line_item_id,
      needed: order.needed,
      picked: order.picked,
      remaining: order.needed - order.picked,
      allocatedQty: 0
    }));
  }

  get totalAllocated(): number {
    return this.allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
  }

  onAvailableChange(): void {
    if (this.totalAllocated > this.availableToPick) {
      this.clearAllocations();
    }
  }

  incrementAllocation(alloc: OrderAllocation): void {
    const remainingAvailable = this.availableToPick - this.totalAllocated;

    if (alloc.allocatedQty < alloc.remaining && remainingAvailable > 0) {
      alloc.allocatedQty++;
    }
  }

  decrementAllocation(alloc: OrderAllocation): void {
    if (alloc.allocatedQty > 0) {
      alloc.allocatedQty--;
    }
  }

  distributeEvenly(): void {
    this.clearAllocations();

    const ordersNeedingPicks = this.allocations.filter(a => a.remaining > 0);
    if (ordersNeedingPicks.length === 0) return;

    let remaining = this.availableToPick;
    let orderIndex = 0;

    while (remaining > 0) {
      const alloc = ordersNeedingPicks[orderIndex];
      const canAllocate = alloc.remaining - alloc.allocatedQty;

      if (canAllocate > 0) {
        alloc.allocatedQty++;
        remaining--;
      }

      orderIndex = (orderIndex + 1) % ordersNeedingPicks.length;

      const allFull = ordersNeedingPicks.every(a =>
        a.allocatedQty >= a.remaining
      );
      if (allFull) break;
    }
  }

  fillInOrder(): void {
    this.clearAllocations();

    let remaining = this.availableToPick;

    for (const alloc of this.allocations) {
      if (remaining <= 0) break;

      const toAllocate = Math.min(remaining, alloc.remaining);
      alloc.allocatedQty = toAllocate;
      remaining -= toAllocate;
    }
  }

  clearAllocations(): void {
    this.allocations.forEach(a => a.allocatedQty = 0);
  }

  close(): void {
    this.show = false;
    this.showChange.emit(false);
  }

  save(): void {
    if (this.totalAllocated === 0 || this.totalAllocated > this.availableToPick) return;

    this.saving = true;

    const picksToApply = this.allocations
      .filter(a => a.allocatedQty > 0)
      .map(a => ({ lineItemId: a.lineItemId, qty: a.allocatedQty }));

    this.pick.emit(picksToApply);

    setTimeout(() => {
      this.saving = false;
      this.close();
    }, 500);
  }
}
