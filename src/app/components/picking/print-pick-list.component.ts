import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order, Tool, LineItemWithPicks } from '../../models';

@Component({
  selector: 'app-print-pick-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-printer me-2"></i>Print Pick List
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <!-- Print Options -->
            <div class="row mb-4">
              <div class="col-md-6">
                <label class="form-label">Select Tools to Include</label>
                <div class="border rounded p-2" style="max-height: 150px; overflow-y: auto;">
                  <div class="form-check" *ngFor="let tool of tools">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      [id]="'tool-' + tool.id"
                      [checked]="selectedTools.has(tool.id)"
                      (change)="toggleTool(tool.id)"
                    >
                    <label class="form-check-label" [for]="'tool-' + tool.id">
                      {{ tool.tool_number }}
                      <span class="text-muted small" *ngIf="tool.serial_number">({{ tool.serial_number }})</span>
                    </label>
                  </div>
                </div>
                <div class="mt-2">
                  <button class="btn btn-sm btn-outline-secondary me-1" (click)="selectAllTools()">Select All</button>
                  <button class="btn btn-sm btn-outline-secondary" (click)="clearToolSelection()">Clear</button>
                </div>
              </div>
              <div class="col-md-6">
                <label class="form-label">Options</label>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="showCompleted" [(ngModel)]="showCompleted">
                  <label class="form-check-label" for="showCompleted">Include completed items</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="showLocation" [(ngModel)]="showLocation">
                  <label class="form-check-label" for="showLocation">Show location column</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="groupByLocation" [(ngModel)]="groupByLocation">
                  <label class="form-check-label" for="groupByLocation">Group by location</label>
                </div>
              </div>
            </div>

            <!-- Print Preview -->
            <div class="border rounded p-3 bg-white" id="printPreview">
              <div class="text-center mb-3">
                <h4 class="mb-1">Pick List - SO-{{ order?.so_number }}</h4>
                <p class="text-muted small mb-0">
                  {{ order?.customer_name || 'No customer' }}
                  <span *ngIf="order?.po_number"> | PO: {{ order?.po_number }}</span>
                  <span *ngIf="order?.due_date"> | Due: {{ formatDate(order?.due_date) }}</span>
                </p>
                <p class="small text-muted">
                  Tools: {{ getSelectedToolNumbers().join(', ') || 'None selected' }}
                </p>
              </div>

              <table class="table table-sm table-bordered">
                <thead class="table-light">
                  <tr>
                    <th style="width: 30px;"></th>
                    <th>Part Number</th>
                    <th *ngIf="showLocation">Location</th>
                    <th>Description</th>
                    <th class="text-center" style="width: 80px;">Qty</th>
                    <th class="text-center" style="width: 80px;">Picked</th>
                  </tr>
                </thead>
                <tbody>
                  <ng-container *ngFor="let item of filteredItems; let i = index">
                    <tr *ngIf="groupByLocation && shouldShowGroupHeader(item, i)" class="table-secondary">
                      <td colspan="6" class="fw-bold small py-1">
                        <i class="bi bi-geo-alt me-1"></i>{{ getLocationGroup(item.location) }}
                      </td>
                    </tr>
                    <tr>
                      <td class="text-center">
                        <div class="border rounded" style="width: 20px; height: 20px;"></div>
                      </td>
                      <td class="font-monospace small">{{ item.part_number }}</td>
                      <td *ngIf="showLocation" class="small">{{ item.location || '-' }}</td>
                      <td class="small text-muted">{{ item.description || '-' }}</td>
                      <td class="text-center fw-bold">{{ item.qty_per_unit }}</td>
                      <td class="text-center">
                        <span *ngIf="item.total_picked > 0" class="text-success">{{ item.total_picked }}</span>
                        <span *ngIf="item.total_picked === 0">-</span>
                      </td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>

              <div class="row mt-4 small text-muted">
                <div class="col-6">
                  <p class="mb-1"><strong>Picked By:</strong> _____________________</p>
                </div>
                <div class="col-6 text-end">
                  <p class="mb-1"><strong>Date:</strong> _____________________</p>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="print()">
              <i class="bi bi-printer me-1"></i> Print
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="show"></div>
  `,
  styles: [`
    @media print {
      .modal-header, .modal-footer, .modal-backdrop, .btn {
        display: none !important;
      }
      .modal, .modal-dialog, .modal-content {
        position: static !important;
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }
      #printPreview {
        border: none !important;
      }
    }
  `]
})
export class PrintPickListComponent implements OnInit {
  @Input() show = false;
  @Input() order: Order | null = null;
  @Input() tools: Tool[] = [];
  @Input() lineItems: LineItemWithPicks[] = [];

  selectedTools = new Set<string>();
  showCompleted = false;
  showLocation = true;
  groupByLocation = true;

  private closeCallback: (() => void) | null = null;

  ngOnInit(): void {
    // Select all tools by default
    this.selectAllTools();
  }

  setCloseCallback(callback: () => void): void {
    this.closeCallback = callback;
  }

  close(): void {
    this.show = false;
    if (this.closeCallback) {
      this.closeCallback();
    }
  }

  toggleTool(toolId: string): void {
    if (this.selectedTools.has(toolId)) {
      this.selectedTools.delete(toolId);
    } else {
      this.selectedTools.add(toolId);
    }
  }

  selectAllTools(): void {
    this.selectedTools = new Set(this.tools.map(t => t.id));
  }

  clearToolSelection(): void {
    this.selectedTools.clear();
  }

  getSelectedToolNumbers(): string[] {
    return this.tools
      .filter(t => this.selectedTools.has(t.id))
      .map(t => t.tool_number);
  }

  get filteredItems(): LineItemWithPicks[] {
    let items = this.lineItems;

    // Filter by completion status
    if (!this.showCompleted) {
      items = items.filter(item => item.remaining > 0);
    }

    // Sort by location if grouping
    if (this.groupByLocation) {
      items = [...items].sort((a, b) => {
        const locA = a.location || '';
        const locB = b.location || '';
        if (!locA && locB) return 1;
        if (locA && !locB) return -1;
        return locA.localeCompare(locB, undefined, { numeric: true });
      });
    }

    return items;
  }

  getLocationGroup(location: string | null | undefined): string {
    if (!location) return 'No Location';
    const parts = location.split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : parts[0];
  }

  shouldShowGroupHeader(item: LineItemWithPicks, index: number): boolean {
    if (!this.groupByLocation) return false;
    if (index === 0) return true;

    const items = this.filteredItems;
    const prevItem = items[index - 1];
    return this.getLocationGroup(item.location) !== this.getLocationGroup(prevItem.location);
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  }

  print(): void {
    window.print();
  }
}
