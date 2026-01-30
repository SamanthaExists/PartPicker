import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tool, LineItemWithPicks } from '../../models';

interface ToolAllocation {
  toolId: string;
  toolNumber: string;
  currentPicked: number;
  maxQty: number;
  allocatedQty: number;
}

@Component({
  selector: 'app-distribute-inventory-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-diagram-3 me-2"></i>Distribute Inventory
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body" *ngIf="lineItem">
            <div class="mb-3">
              <strong class="font-monospace">{{ lineItem.part_number }}</strong>
              <p class="text-muted small mb-0" *ngIf="lineItem.description">{{ lineItem.description }}</p>
            </div>

            <div class="alert alert-info small mb-3">
              <div class="row">
                <div class="col-4">
                  <span class="text-muted">Total Needed:</span>
                  <strong class="ms-1">{{ lineItem.total_qty_needed }}</strong>
                </div>
                <div class="col-4">
                  <span class="text-muted">Picked:</span>
                  <strong class="ms-1">{{ lineItem.total_picked }}</strong>
                </div>
                <div class="col-4">
                  <span class="text-muted">Available:</span>
                  <strong class="ms-1" [class.text-warning]="(lineItem.qty_available || 0) < availableToAllocate">
                    {{ lineItem.qty_available ?? 'Unknown' }}
                  </strong>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Available to Allocate</label>
              <input
                type="number"
                class="form-control"
                [(ngModel)]="availableToAllocate"
                [min]="0"
                (change)="onAvailableChange()"
              >
              <div class="form-text">Enter the quantity you have available to distribute</div>
            </div>

            <hr>

            <h6>Allocate to Tools</h6>
            <div class="d-flex flex-column gap-2">
              <div *ngFor="let alloc of allocations" class="d-flex align-items-center gap-2 p-2 border rounded">
                <div class="flex-grow-1">
                  <strong>{{ alloc.toolNumber }}</strong>
                  <span class="small text-muted ms-2">
                    ({{ alloc.currentPicked }}/{{ alloc.maxQty }} picked)
                  </span>
                </div>
                <div class="input-group" style="width: 140px;">
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
                    [max]="alloc.maxQty - alloc.currentPicked"
                  >
                  <button
                    class="btn btn-outline-secondary btn-sm"
                    type="button"
                    (click)="incrementAllocation(alloc)"
                    [disabled]="alloc.allocatedQty >= (alloc.maxQty - alloc.currentPicked) || totalAllocated >= availableToAllocate"
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
                <button class="btn btn-sm btn-outline-secondary" (click)="clearAllocations()">
                  Clear
                </button>
              </div>
              <div class="text-end">
                <span class="small text-muted">Allocated:</span>
                <strong class="ms-1" [class.text-danger]="totalAllocated > availableToAllocate">
                  {{ totalAllocated }}/{{ availableToAllocate }}
                </strong>
              </div>
            </div>

            <div *ngIf="totalAllocated > availableToAllocate" class="alert alert-danger small mt-3 mb-0">
              <i class="bi bi-exclamation-triangle me-1"></i>
              Allocated quantity exceeds available inventory!
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="totalAllocated === 0 || totalAllocated > availableToAllocate || saving"
              (click)="save()"
            >
              <i class="bi me-1" [class]="saving ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
              {{ saving ? 'Saving...' : 'Apply Allocation' }}
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
export class DistributeInventoryDialogComponent implements OnChanges {
  @Input() show = false;
  @Input() lineItem: LineItemWithPicks | null = null;
  @Input() tools: Tool[] = [];
  @Input() getToolPicked: (item: LineItemWithPicks, tool: Tool) => number = () => 0;

  @Output() showChange = new EventEmitter<boolean>();
  @Output() distribute = new EventEmitter<{ toolId: string; qty: number }[]>();

  allocations: ToolAllocation[] = [];
  availableToAllocate = 0;
  saving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show && this.lineItem) {
      this.initializeAllocations();
    }
  }

  private initializeAllocations(): void {
    if (!this.lineItem) return;

    this.availableToAllocate = this.lineItem.qty_available ?? this.lineItem.remaining;

    this.allocations = this.tools.map(tool => {
      const currentPicked = this.getToolPicked(this.lineItem!, tool);
      return {
        toolId: tool.id,
        toolNumber: tool.tool_number,
        currentPicked,
        maxQty: this.lineItem!.qty_per_unit,
        allocatedQty: 0
      };
    });
  }

  get totalAllocated(): number {
    return this.allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
  }

  onAvailableChange(): void {
    // Clamp allocations if available decreased
    if (this.totalAllocated > this.availableToAllocate) {
      this.clearAllocations();
    }
  }

  incrementAllocation(alloc: ToolAllocation): void {
    const maxForTool = alloc.maxQty - alloc.currentPicked;
    const remainingAvailable = this.availableToAllocate - this.totalAllocated;

    if (alloc.allocatedQty < maxForTool && remainingAvailable > 0) {
      alloc.allocatedQty++;
    }
  }

  decrementAllocation(alloc: ToolAllocation): void {
    if (alloc.allocatedQty > 0) {
      alloc.allocatedQty--;
    }
  }

  distributeEvenly(): void {
    this.clearAllocations();

    // Get tools that still need picks
    const toolsNeedingPicks = this.allocations.filter(a => a.currentPicked < a.maxQty);
    if (toolsNeedingPicks.length === 0) return;

    let remaining = this.availableToAllocate;
    let toolIndex = 0;

    while (remaining > 0) {
      const alloc = toolsNeedingPicks[toolIndex];
      const canAllocate = alloc.maxQty - alloc.currentPicked - alloc.allocatedQty;

      if (canAllocate > 0) {
        alloc.allocatedQty++;
        remaining--;
      }

      toolIndex = (toolIndex + 1) % toolsNeedingPicks.length;

      // Break if all tools are full
      const allFull = toolsNeedingPicks.every(a =>
        a.allocatedQty >= (a.maxQty - a.currentPicked)
      );
      if (allFull) break;
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
    if (this.totalAllocated === 0 || this.totalAllocated > this.availableToAllocate) return;

    this.saving = true;

    const allocationsToApply = this.allocations
      .filter(a => a.allocatedQty > 0)
      .map(a => ({ toolId: a.toolId, qty: a.allocatedQty }));

    this.distribute.emit(allocationsToApply);

    setTimeout(() => {
      this.saving = false;
      this.close();
    }, 500);
  }
}
