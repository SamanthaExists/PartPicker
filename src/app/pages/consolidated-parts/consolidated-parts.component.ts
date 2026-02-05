import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ConsolidatedPartsService } from '../../services/consolidated-parts.service';
import { PicksService } from '../../services/picks.service';
import { SettingsService } from '../../services/settings.service';
import { UtilsService } from '../../services/utils.service';
import { ConsolidatedPart } from '../../models';
import { MultiOrderPickDialogComponent } from '../../components/dialogs/multi-order-pick-dialog.component';

type FilterType = 'all' | 'remaining' | 'complete' | 'low_stock' | 'out_of_stock';

@Component({
  selector: 'app-consolidated-parts',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MultiOrderPickDialogComponent],
  template: `
    <div>
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h1 class="h3 fw-bold mb-1">Consolidated Parts</h1>
          <p class="text-muted mb-0">View all parts needed across active orders</p>
        </div>
        <div>
          <button class="btn btn-outline-primary" (click)="copyPartNumbers()" [disabled]="filteredParts.length === 0">
            <i class="bi bi-clipboard me-1"></i>
            Copy Part Numbers
          </button>
        </div>
      </div>

      <!-- Stats Cards - Clickable -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="card cursor-pointer" [class.border-primary]="filter === 'all'" (click)="setFilter('all')">
            <div class="card-body">
              <p class="text-muted small mb-1">Total Parts</p>
              <h3 class="mb-0 fw-bold">{{ filteredParts.length }}</h3>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card cursor-pointer" [class.border-warning]="filter === 'low_stock'" (click)="setFilter('low_stock')">
            <div class="card-body">
              <p class="text-muted small mb-1">Low Stock</p>
              <h3 class="mb-0 fw-bold text-warning">{{ lowStockCount }}</h3>
              <small class="text-muted">Available &lt; Needed</small>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card cursor-pointer" [class.border-danger]="filter === 'out_of_stock'" (click)="setFilter('out_of_stock')">
            <div class="card-body">
              <p class="text-muted small mb-1">Out of Stock</p>
              <h3 class="mb-0 fw-bold text-danger">{{ outOfStockCount }}</h3>
              <small class="text-muted">Qty Available = 0</small>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card cursor-pointer" [class.border-success]="filter === 'complete'" (click)="setFilter('complete')">
            <div class="card-body">
              <p class="text-muted small mb-1">Complete</p>
              <h3 class="mb-0 fw-bold text-success">{{ completeCount }}</h3>
              <small class="text-muted">Fully picked</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control" placeholder="Search by part number or description..."
                       [(ngModel)]="searchQuery">
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex gap-2 flex-wrap align-items-center">
                <button class="btn btn-sm"
                        [class.btn-primary]="filter === 'all'"
                        [class.btn-outline-secondary]="filter !== 'all'"
                        (click)="setFilter('all')">All</button>
                <button class="btn btn-sm"
                        [class.btn-primary]="filter === 'remaining'"
                        [class.btn-outline-secondary]="filter !== 'remaining'"
                        (click)="setFilter('remaining')">Remaining</button>
                <button class="btn btn-sm"
                        [class.btn-warning]="filter === 'low_stock'"
                        [class.btn-outline-warning]="filter !== 'low_stock'"
                        (click)="setFilter('low_stock')">Low Stock</button>
                <button class="btn btn-sm"
                        [class.btn-danger]="filter === 'out_of_stock'"
                        [class.btn-outline-danger]="filter !== 'out_of_stock'"
                        (click)="setFilter('out_of_stock')">Out of Stock</button>
                <button class="btn btn-sm"
                        [class.btn-success]="filter === 'complete'"
                        [class.btn-outline-success]="filter !== 'complete'"
                        (click)="setFilter('complete')">Complete</button>
                <div class="dropdown" (click)="$event.stopPropagation()">
                  <button class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-1"
                          type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                    <i class="bi bi-tools"></i>
                    {{ selectedAssemblies.size === 0 ? 'All Assemblies' : selectedAssemblies.size + ' Assembly' + (selectedAssemblies.size !== 1 ? 's' : '') }}
                  </button>
                  <div class="dropdown-menu p-0" style="min-width: 220px;">
                    <div class="d-flex border-bottom p-2 gap-2">
                      <button class="btn btn-sm btn-ghost flex-fill" (click)="selectAllAssemblies()">Select All</button>
                      <button class="btn btn-sm btn-ghost flex-fill" (click)="deselectAllAssemblies()">Clear</button>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto;" class="p-2">
                      <div *ngFor="let model of uniqueAssemblies"
                           class="form-check px-2 py-1">
                        <input class="form-check-input" type="checkbox"
                               [id]="'parts-assembly-' + model"
                               [checked]="selectedAssemblies.has(model)"
                               (change)="toggleAssembly(model)">
                        <label class="form-check-label" [for]="'parts-assembly-' + model">
                          {{ model }}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="form-check ms-3">
                  <input class="form-check-input" type="checkbox" id="hideOutOfStock"
                         [ngModel]="hideOutOfStock"
                         (ngModelChange)="onHideOutOfStockChange($event)">
                  <label class="form-check-label" for="hideOutOfStock">Hide out of stock</label>
                </div>
                <div class="form-check ms-3">
                  <input class="form-check-input" type="checkbox" id="showOutOfStockOnly"
                         [ngModel]="showOutOfStockOnly"
                         (ngModelChange)="onShowOutOfStockOnlyChange($event)">
                  <label class="form-check-label" for="showOutOfStockOnly">
                    Out of stock only
                    <span *ngIf="totalOutOfStockCount > 0" class="badge bg-secondary ms-1">{{ totalOutOfStockCount }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Copy notification -->
      <div *ngIf="copyMessage" class="alert alert-success alert-dismissible fade show" role="alert">
        <i class="bi bi-check-circle me-2"></i>{{ copyMessage }}
        <button type="button" class="btn-close" (click)="copyMessage = ''"></button>
      </div>

      <!-- Parts List -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading parts...</div>
      </div>

      <div *ngIf="!loading && filteredParts.length === 0" class="card">
        <div class="card-body text-center py-5 text-muted">
          {{ searchQuery || filter !== 'all' ? 'No parts match your filters' : 'No parts found' }}
        </div>
      </div>

      <div *ngIf="!loading && filteredParts.length > 0" class="card">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr class="table-secondary">
                <th>Part Number</th>
                <th>Description</th>
                <th>Location</th>
                <th class="text-center">Available</th>
                <th class="text-center">Needed</th>
                <th class="text-center">Picked</th>
                <th class="text-center">Remaining</th>
                <th>Orders</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let part of filteredParts; let idx = index"
                  [id]="'part-row-' + idx"
                  [class.table-success]="part.remaining === 0"
                  [class.table-warning]="part.total_picked > 0 && part.remaining > 0"
                  [class.table-danger]="getQtyAvailable(part) === 0 && part.remaining > 0">
                <td class="font-mono fw-medium">{{ part.part_number }}</td>
                <td class="text-muted">{{ part.description || '-' }}</td>
                <td>{{ part.location || '-' }}</td>
                <td class="text-center">
                  <span [class.text-danger]="getQtyAvailable(part) !== null && getQtyAvailable(part)! < part.remaining"
                        [class.fw-bold]="getQtyAvailable(part) !== null && getQtyAvailable(part)! < part.remaining">
                    {{ getQtyAvailable(part) ?? '-' }}
                  </span>
                </td>
                <td class="text-center">{{ part.total_needed }}</td>
                <td class="text-center">{{ part.total_picked }}</td>
                <td class="text-center">
                  <span class="badge" [ngClass]="part.remaining === 0 ? 'bg-success' : 'bg-warning text-dark'">
                    {{ part.remaining }}
                  </span>
                </td>
                <td>
                  <div class="d-flex flex-wrap gap-1">
                    <a *ngFor="let order of part.orders"
                       [routerLink]="['/orders', order.order_id]"
                       class="badge bg-body-secondary text-body border text-decoration-none">
                      SO-{{ order.so_number }}
                      <span class="text-muted">({{ order.picked }}/{{ order.needed }})</span>
                    </a>
                  </div>
                </td>
                <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-primary"
                    (click)="openMultiOrderPick(part)"
                    [disabled]="part.remaining === 0"
                    title="Pick across orders"
                  >
                    <i class="bi bi-box-arrow-in-down"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Multi-Order Pick Dialog -->
    <app-multi-order-pick-dialog
      [(show)]="showMultiOrderPick"
      [part]="selectedPart"
      (pick)="handleMultiOrderPick($event)"
    ></app-multi-order-pick-dialog>
  `,
  styles: [`
    .cursor-pointer {
      cursor: pointer;
      transition: border-color 0.15s ease-in-out;
    }
    .cursor-pointer:hover {
      border-color: var(--bs-primary) !important;
    }
  `]
})
export class ConsolidatedPartsComponent implements OnInit, OnDestroy {
  parts: ConsolidatedPart[] = [];
  loading = true;
  searchQuery = '';
  filter: FilterType = 'all';
  copyMessage = '';
  hideOutOfStock = false;
  showOutOfStockOnly = false;
  selectedAssemblies = new Set<string>();

  // Multi-order pick dialog
  showMultiOrderPick = false;
  selectedPart: ConsolidatedPart | null = null;
  scrollToPartNumber: string | null = null;

  // Track qty_available per part (may need to fetch from line_items)
  private qtyAvailableMap: Map<string, number | null> = new Map();

  private subscriptions: Subscription[] = [];

  constructor(
    private partsService: ConsolidatedPartsService,
    private picksService: PicksService,
    private settingsService: SettingsService,
    public utils: UtilsService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Read URL search parameter on init
    const urlSearch = this.route.snapshot.queryParamMap.get('search');
    if (urlSearch) {
      this.searchQuery = urlSearch;
      // Clear URL param to keep URL clean
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    this.subscriptions.push(
      this.partsService.parts$.subscribe(parts => {
        this.parts = parts;
        // Extract qty_available from first order's line item if available
        parts.forEach(p => {
          // We'll need to track this - for now using null
          if (!this.qtyAvailableMap.has(p.part_number)) {
            this.qtyAvailableMap.set(p.part_number, null);
          }
        });
        // Scroll to tracked part after data refresh
        if (this.scrollToPartNumber) {
          this.scrollToPartByNumber();
        }
      }),
      this.partsService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  private scrollToPartByNumber(): void {
    if (!this.scrollToPartNumber) return;

    // Find the index of the part in filteredParts
    const index = this.filteredParts.findIndex(p => p.part_number === this.scrollToPartNumber);

    if (index >= 0) {
      setTimeout(() => {
        const element = document.getElementById(`part-row-${index}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        this.scrollToPartNumber = null;
      }, 100);
    } else {
      // Part not found (may be hidden by filter), clear gracefully
      this.scrollToPartNumber = null;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get uniqueAssemblies(): string[] {
    const models = new Set<string>();
    this.parts.forEach(p => {
      p.orders.forEach(o => {
        if (o.tool_model) models.add(o.tool_model);
      });
    });
    return Array.from(models).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  toggleAssembly(model: string): void {
    if (this.selectedAssemblies.has(model)) {
      this.selectedAssemblies.delete(model);
    } else {
      this.selectedAssemblies.add(model);
    }
    this.selectedAssemblies = new Set(this.selectedAssemblies);
  }

  selectAllAssemblies(): void {
    this.selectedAssemblies = new Set(this.uniqueAssemblies);
  }

  deselectAllAssemblies(): void {
    this.selectedAssemblies = new Set();
  }

  setFilter(filter: FilterType): void {
    this.filter = filter;
  }

  onHideOutOfStockChange(checked: boolean): void {
    this.hideOutOfStock = checked;
    if (checked) {
      this.showOutOfStockOnly = false;
    }
  }

  onShowOutOfStockOnlyChange(checked: boolean): void {
    this.showOutOfStockOnly = checked;
    if (checked) {
      this.hideOutOfStock = false;
    }
  }

  getQtyAvailable(part: ConsolidatedPart): number | null {
    return this.qtyAvailableMap.get(part.part_number) ?? null;
  }

  get filteredParts(): ConsolidatedPart[] {
    return this.parts.filter(part => {
      const matchesSearch =
        part.part_number.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        part.description?.toLowerCase().includes(this.searchQuery.toLowerCase());

      let matchesFilter = true;
      switch (this.filter) {
        case 'remaining':
          matchesFilter = part.remaining > 0;
          break;
        case 'complete':
          matchesFilter = part.remaining === 0;
          break;
        case 'low_stock':
          const available = this.getQtyAvailable(part);
          matchesFilter = available !== null && available < part.remaining && available > 0;
          break;
        case 'out_of_stock':
          const qty = this.getQtyAvailable(part);
          matchesFilter = qty === 0 && part.remaining > 0;
          break;
      }

      // Hide out of stock filter - excludes parts where qty_available is 0
      const matchesStock = !this.hideOutOfStock || (this.getQtyAvailable(part) !== 0);

      // Show out of stock only filter - includes only parts where qty_available is 0
      const matchesOutOfStockOnly = !this.showOutOfStockOnly || this.getQtyAvailable(part) === 0;

      // Assembly filter - check if any of the part's orders match a selected assembly
      const matchesAssembly = this.selectedAssemblies.size === 0 ||
        part.orders.some(o => !!o.tool_model && this.selectedAssemblies.has(o.tool_model));

      return matchesSearch && matchesFilter && matchesStock && matchesOutOfStockOnly && matchesAssembly;
    });
  }

  get lowStockCount(): number {
    return this.filteredParts.filter(p => {
      const available = this.getQtyAvailable(p);
      return available !== null && available < p.remaining && available > 0;
    }).length;
  }

  get outOfStockCount(): number {
    return this.filteredParts.filter(p => {
      const qty = this.getQtyAvailable(p);
      return qty === 0 && p.remaining > 0;
    }).length;
  }

  get completeCount(): number {
    return this.filteredParts.filter(p => p.remaining === 0).length;
  }

  get totalOutOfStockCount(): number {
    return this.parts.filter(p => this.getQtyAvailable(p) === 0).length;
  }

  get totalNeeded(): number {
    return this.parts.reduce((sum, p) => sum + p.total_needed, 0);
  }

  get totalPicked(): number {
    return this.parts.reduce((sum, p) => sum + p.total_picked, 0);
  }

  get totalRemaining(): number {
    return this.parts.reduce((sum, p) => sum + p.remaining, 0);
  }

  async copyPartNumbers(): Promise<void> {
    const partNumbers = this.filteredParts.map(p => p.part_number).join('\n');

    try {
      await navigator.clipboard.writeText(partNumbers);
      this.copyMessage = `Copied ${this.filteredParts.length} part numbers to clipboard`;
      setTimeout(() => this.copyMessage = '', 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
      this.copyMessage = 'Failed to copy to clipboard';
      setTimeout(() => this.copyMessage = '', 3000);
    }
  }

  openMultiOrderPick(part: ConsolidatedPart): void {
    this.selectedPart = part;
    this.showMultiOrderPick = true;
  }

  async handleMultiOrderPick(picks: { lineItemId: string; qty: number }[]): Promise<void> {
    const settings = this.settingsService.getSettings();
    const userName = settings.user_name || 'Unknown';

    // Track part for scroll after refresh
    if (this.selectedPart) {
      this.scrollToPartNumber = this.selectedPart.part_number;
    }

    for (const pick of picks) {
      // Find the order info for this line item
      const orderInfo = this.selectedPart?.orders.find(o => o.line_item_id === pick.lineItemId);
      if (!orderInfo) continue;

      // We need to get the tool_id for this order to record the pick
      // For consolidated picks, we'll pick for the first tool of the order
      // This is a simplified approach - in production you might want to specify the tool
      await this.picksService.recordPickForLineItem(
        pick.lineItemId,
        pick.qty,
        userName
      );
    }

    // Refresh the parts list
    this.partsService.fetchParts();
  }
}
