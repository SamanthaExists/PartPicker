import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ItemsToOrderService } from '../../services/consolidated-parts.service';
import { PartsService } from '../../services/parts.service';
import { UtilsService } from '../../services/utils.service';
import { ExcelService } from '../../services/excel.service';
import { ItemToOrder } from '../../models';
import { PartDetailComponent } from '../../components/parts/part-detail.component';

type SortMode = 'remaining' | 'part_number' | 'location';

const ITEMS_TO_ORDER_SORT_KEY = 'items-to-order-sort-preference';

@Component({
  selector: 'app-items-to-order',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PartDetailComponent],
  template: `
    <div>
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h1 class="h3 fw-bold mb-1">Items to Order</h1>
          <p class="text-muted mb-0">Parts with insufficient stock to complete active orders</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" (click)="handleCopyPartNumbers()" [disabled]="filteredItems.length === 0">
            <i class="bi bi-clipboard me-2"></i>Copy Part Numbers
          </button>
          <button class="btn btn-outline-primary" (click)="handleExport()" [disabled]="filteredItems.length === 0">
            <i class="bi bi-download me-2"></i>Export
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
          <a class="nav-link d-flex align-items-center gap-2"
             [class.active]="activeTab === 'need-to-order'"
             href="javascript:void(0)"
             (click)="activeTab = 'need-to-order'">
            <i class="bi bi-cart3"></i>
            Need to Order
            <span *ngIf="items.length > 0" class="badge bg-secondary">{{ items.length }}</span>
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link d-flex align-items-center gap-2"
             [class.active]="activeTab === 'on-order'"
             href="javascript:void(0)"
             (click)="activeTab = 'on-order'">
            <i class="bi bi-truck"></i>
            On Order
            <span *ngIf="onOrderItems.length > 0" class="badge bg-secondary">{{ onOrderItems.length }}</span>
          </a>
        </li>
      </ul>

      <!-- Stats Cards -->
      <div class="row g-3 mb-4" *ngIf="!loading && filteredItems.length > 0">
        <ng-container *ngIf="activeTab === 'need-to-order'">
          <div class="col-md-4">
            <div class="card border-start border-warning border-4">
              <div class="card-body d-flex align-items-center gap-3">
                <div class="rounded-circle bg-warning bg-opacity-10 p-2">
                  <i class="bi bi-cart3 fs-5 text-warning"></i>
                </div>
                <div>
                  <div class="fs-4 fw-bold">{{ statsUniqueParts }}</div>
                  <div class="text-muted small">Unique Parts to Order</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card border-start border-danger border-4">
              <div class="card-body d-flex align-items-center gap-3">
                <div class="rounded-circle bg-danger bg-opacity-10 p-2">
                  <i class="bi bi-exclamation-circle fs-5 text-danger"></i>
                </div>
                <div>
                  <div class="fs-4 fw-bold">{{ statsTotalQty }}</div>
                  <div class="text-muted small">Total Qty to Order</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card">
              <div class="card-body">
                <div class="fs-4 fw-bold">{{ statsOrdersAffected }}</div>
                <div class="text-muted small">Orders Affected</div>
              </div>
            </div>
          </div>
        </ng-container>
        <ng-container *ngIf="activeTab === 'on-order'">
          <div class="col-md-4">
            <div class="card border-start border-info border-4">
              <div class="card-body d-flex align-items-center gap-3">
                <div class="rounded-circle bg-info bg-opacity-10 p-2">
                  <i class="bi bi-truck fs-5 text-info"></i>
                </div>
                <div>
                  <div class="fs-4 fw-bold">{{ statsUniqueParts }}</div>
                  <div class="text-muted small">Unique Parts On Order</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card border-start border-info border-4">
              <div class="card-body d-flex align-items-center gap-3">
                <div class="rounded-circle bg-info bg-opacity-10 p-2">
                  <i class="bi bi-box-seam fs-5 text-info"></i>
                </div>
                <div>
                  <div class="fs-4 fw-bold">{{ statsTotalOnOrderQty }}</div>
                  <div class="text-muted small">Total Qty On Order</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card">
              <div class="card-body">
                <div class="fs-4 fw-bold">{{ statsOrdersAffected }}</div>
                <div class="text-muted small">Orders Affected</div>
              </div>
            </div>
          </div>
        </ng-container>
      </div>

      <!-- Filters -->
      <div class="card mb-4" *ngIf="currentItems.length > 0">
        <div class="card-body">
          <div class="d-flex flex-column gap-3">
            <!-- Search Bar -->
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" placeholder="Search by part number, description, or location..."
                     [(ngModel)]="searchQuery">
            </div>

            <!-- Filter Options Row -->
            <div class="d-flex flex-column flex-sm-row gap-2 align-items-sm-center flex-wrap">
              <!-- Sort Dropdown -->
              <div class="d-flex align-items-center gap-2">
                <i class="bi bi-arrow-down-up text-muted"></i>
                <select class="form-select" style="width: auto;" [(ngModel)]="sortMode" (ngModelChange)="onSortChange()">
                  <option value="remaining">Sort by Qty Needed (High to Low)</option>
                  <option value="part_number">Sort by Part Number</option>
                  <option value="location">Sort by Location</option>
                </select>
              </div>

              <!-- Order Filter Dropdown -->
              <div class="dropdown" (click)="$event.stopPropagation()">
                <button class="btn btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2"
                        type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                  <i class="bi bi-funnel"></i>
                  {{ selectedOrders.size === 0 ? 'All Orders' : selectedOrders.size + ' Order' + (selectedOrders.size !== 1 ? 's' : '') }}
                </button>
                <div class="dropdown-menu p-0" style="min-width: 220px;">
                  <div class="d-flex border-bottom p-2 gap-2">
                    <button class="btn btn-sm btn-ghost flex-fill" (click)="selectAllOrders()">Select All</button>
                    <button class="btn btn-sm btn-ghost flex-fill" (click)="deselectAllOrders()">Clear</button>
                  </div>
                  <div style="max-height: 250px; overflow-y: auto;" class="p-2">
                    <div *ngFor="let order of uniqueOrders"
                         class="form-check px-2 py-1">
                      <input class="form-check-input" type="checkbox"
                             [id]="'order-' + order.id"
                             [checked]="selectedOrders.has(order.id)"
                             (change)="toggleOrder(order.id)">
                      <label class="form-check-label" [for]="'order-' + order.id">
                        SO-{{ order.so_number }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Location Filter Dropdown -->
              <div class="dropdown" (click)="$event.stopPropagation()">
                <button class="btn btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2"
                        type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                  <i class="bi bi-geo-alt"></i>
                  {{ selectedLocations.size === 0 ? 'All Locations' : selectedLocations.size + ' Location' + (selectedLocations.size !== 1 ? 's' : '') }}
                </button>
                <div class="dropdown-menu p-0" style="min-width: 220px;">
                  <div class="d-flex border-bottom p-2 gap-2">
                    <button class="btn btn-sm btn-ghost flex-fill" (click)="selectAllLocations()">Select All</button>
                    <button class="btn btn-sm btn-ghost flex-fill" (click)="deselectAllLocations()">Clear</button>
                  </div>
                  <div style="max-height: 250px; overflow-y: auto;" class="p-2">
                    <div *ngFor="let loc of uniqueLocations"
                         class="form-check px-2 py-1">
                      <input class="form-check-input" type="checkbox"
                             [id]="'loc-' + loc"
                             [checked]="selectedLocations.has(loc)"
                             (change)="toggleLocation(loc)">
                      <label class="form-check-label" [for]="'loc-' + loc">
                        {{ loc }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Assembly Filter Dropdown -->
              <div class="dropdown" (click)="$event.stopPropagation()">
                <button class="btn btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2"
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
                             [id]="'ito-assembly-' + model"
                             [checked]="selectedAssemblies.has(model)"
                             (change)="toggleAssembly(model)">
                      <label class="form-check-label" [for]="'ito-assembly-' + model">
                        {{ model }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Clear Filters -->
              <button *ngIf="hasActiveFilters" class="btn btn-sm btn-link text-muted text-decoration-none"
                      (click)="clearFilters()">
                <i class="bi bi-x me-1"></i>Clear
              </button>

              <!-- Results count -->
              <span *ngIf="searchQuery || hasActiveFilters" class="text-muted small ms-auto">
                {{ filteredItems.length }} result{{ filteredItems.length !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div *ngIf="error" class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>{{ error }}
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading...</div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && !error && currentItems.length === 0" class="card">
        <div class="card-body text-center py-5">
          <i class="bi display-4 mb-3" [class]="activeTab === 'need-to-order' ? 'bi-check-circle text-success' : 'bi-truck text-muted'"></i>
          <p class="text-muted mb-0">
            {{ activeTab === 'need-to-order' ? 'No items to order - all parts have stock available!' : 'No items are currently on order.' }}
          </p>
        </div>
      </div>

      <!-- Need to Order Table -->
      <div *ngIf="!loading && activeTab === 'need-to-order' && filteredItems.length > 0" class="card">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr class="table-secondary">
                <th>Part Number</th>
                <th>Description</th>
                <th>Location</th>
                <th class="text-center">Available</th>
                <th class="text-center">On Order</th>
                <th class="text-center">Total Needed</th>
                <th class="text-center">Remaining</th>
                <th class="text-center">Qty to Order</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItems">
                <td class="font-mono fw-medium">
                  <div class="d-flex align-items-center gap-2">
                    <span class="text-primary" style="cursor: pointer;" (click)="openPartDetail(item.part_number, $event)" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ item.part_number }}</span>
                    <button class="btn btn-sm btn-link p-0 text-secondary" (click)="copyPartNumber(item.part_number, $event)" title="Copy part number">
                      <i class="bi" [ngClass]="copiedPartNumber === item.part_number ? 'bi-check-lg text-success' : 'bi-clipboard'"></i>
                    </button>
                  </div>
                </td>
                <td class="text-muted">{{ item.description || '-' }}</td>
                <td>{{ item.location || '-' }}</td>
                <td class="text-center">
                  <span class="badge bg-danger">{{ item.qty_available }}</span>
                </td>
                <td class="text-center">
                  <span *ngIf="item.qty_on_order && item.qty_on_order > 0" class="badge bg-info">
                    {{ item.qty_on_order }}
                  </span>
                  <span *ngIf="!item.qty_on_order || item.qty_on_order <= 0" class="text-muted">-</span>
                </td>
                <td class="text-center">{{ item.total_needed }}</td>
                <td class="text-center">
                  <span class="badge bg-warning text-dark">{{ item.remaining }}</span>
                </td>
                <td class="text-center">
                  <span class="badge" [class]="item.qty_to_order > 0 ? 'bg-danger' : 'bg-success'">{{ item.qty_to_order }}</span>
                </td>
                <td>
                  <div class="d-flex flex-wrap gap-1">
                    <a *ngFor="let order of item.orders"
                       [routerLink]="['/orders', order.order_id]"
                       class="badge bg-body-secondary text-body border text-decoration-none">
                      SO-{{ order.so_number }}
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- On Order Table -->
      <div *ngIf="!loading && activeTab === 'on-order' && filteredItems.length > 0" class="card">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr class="table-secondary">
                <th>Part Number</th>
                <th>Description</th>
                <th>Location</th>
                <th class="text-center">Qty On Order</th>
                <th class="text-center">Remaining Need</th>
                <th class="text-center">Still Need to Order</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItems">
                <td class="font-mono fw-medium">
                  <div class="d-flex align-items-center gap-2">
                    <span class="text-primary" style="cursor: pointer;" (click)="openPartDetail(item.part_number, $event)" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ item.part_number }}</span>
                    <button class="btn btn-sm btn-link p-0 text-secondary" (click)="copyPartNumber(item.part_number, $event)" title="Copy part number">
                      <i class="bi" [ngClass]="copiedPartNumber === item.part_number ? 'bi-check-lg text-success' : 'bi-clipboard'"></i>
                    </button>
                  </div>
                </td>
                <td class="text-muted">{{ item.description || '-' }}</td>
                <td>{{ item.location || '-' }}</td>
                <td class="text-center">
                  <span class="badge bg-info">{{ item.qty_on_order }}</span>
                </td>
                <td class="text-center">
                  <span class="badge bg-warning text-dark">{{ item.remaining }}</span>
                </td>
                <td class="text-center">
                  <span *ngIf="item.qty_to_order > 0" class="badge bg-danger">{{ item.qty_to_order }}</span>
                  <span *ngIf="item.qty_to_order <= 0" class="badge bg-success">Covered</span>
                </td>
                <td>
                  <div class="d-flex flex-wrap gap-1">
                    <a *ngFor="let order of item.orders"
                       [routerLink]="['/orders', order.order_id]"
                       class="badge bg-body-secondary text-body border text-decoration-none">
                      SO-{{ order.so_number }}
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div *ngIf="!loading && currentItems.length > 0 && filteredItems.length === 0" class="card">
        <div class="card-body text-center py-5 text-muted">
          No items match your search or filters
          <div *ngIf="hasActiveFilters" class="mt-2">
            <button class="btn btn-sm btn-link" (click)="clearFilters()">Clear filters</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ItemsToOrderComponent implements OnInit, OnDestroy {
  items: ItemToOrder[] = [];
  onOrderItems: ItemToOrder[] = [];
  loading = true;
  error: string | null = null;
  searchQuery = '';
  activeTab: 'need-to-order' | 'on-order' = 'need-to-order';
  sortMode: SortMode = 'remaining';
  selectedOrders = new Set<string>();
  selectedLocations = new Set<string>();
  selectedAssemblies = new Set<string>();
  copiedPartNumber: string | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private itemsToOrderService: ItemsToOrderService,
    private excelService: ExcelService,
    public utils: UtilsService,
    private partsService: PartsService,
    private modalService: NgbModal
  ) {
    const savedSort = localStorage.getItem(ITEMS_TO_ORDER_SORT_KEY);
    if (savedSort === 'remaining' || savedSort === 'part_number' || savedSort === 'location') {
      this.sortMode = savedSort;
    }
  }

  ngOnInit(): void {
    this.subscriptions.push(
      this.itemsToOrderService.items$.subscribe(items => {
        this.items = items;
      }),
      this.itemsToOrderService.onOrderItems$.subscribe(items => {
        this.onOrderItems = items;
      }),
      this.itemsToOrderService.loading$.subscribe(loading => {
        this.loading = loading;
      }),
      this.itemsToOrderService.error$.subscribe(error => {
        this.error = error;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Current data source based on active tab
  get currentItems(): ItemToOrder[] {
    return this.activeTab === 'need-to-order' ? this.items : this.onOrderItems;
  }

  // Unique orders for filter dropdown
  get uniqueOrders(): { id: string; so_number: string }[] {
    const ordersMap = new Map<string, string>();
    this.currentItems.forEach(item => {
      item.orders.forEach(o => ordersMap.set(o.order_id, o.so_number));
    });
    return Array.from(ordersMap.entries())
      .map(([id, so_number]) => ({ id, so_number }))
      .sort((a, b) => a.so_number.localeCompare(b.so_number, undefined, { numeric: true }));
  }

  // Unique locations for filter dropdown
  get uniqueLocations(): string[] {
    const locs = new Set<string>();
    this.currentItems.forEach(item => {
      if (item.location) locs.add(item.location);
    });
    return Array.from(locs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  get hasActiveFilters(): boolean {
    return this.selectedOrders.size > 0 || this.selectedLocations.size > 0 || this.selectedAssemblies.size > 0;
  }

  get filteredItems(): ItemToOrder[] {
    const filtered = this.currentItems.filter(item => {
      // Search filter
      const matchesSearch = !this.searchQuery ||
        item.part_number.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        item.location?.toLowerCase().includes(this.searchQuery.toLowerCase());

      // Order filter
      const matchesOrder = this.selectedOrders.size === 0 ||
        item.orders.some(o => this.selectedOrders.has(o.order_id));

      // Location filter
      const matchesLocation = this.selectedLocations.size === 0 ||
        (!!item.location && this.selectedLocations.has(item.location));

      // Assembly filter
      const matchesAssembly = this.selectedAssemblies.size === 0 ||
        item.orders.some(o => !!o.tool_model && this.selectedAssemblies.has(o.tool_model));

      return matchesSearch && matchesOrder && matchesLocation && matchesAssembly;
    });

    // Sort
    return this.sortItems(filtered);
  }

  // Stats computed from filtered items
  get statsUniqueParts(): number {
    return this.filteredItems.length;
  }

  get statsTotalQty(): number {
    return this.filteredItems.reduce((sum, p) => sum + p.qty_to_order, 0);
  }

  get statsTotalOnOrderQty(): number {
    return this.filteredItems.reduce((sum, p) => sum + (p.qty_on_order ?? 0), 0);
  }

  get statsOrdersAffected(): number {
    return new Set(this.filteredItems.flatMap(item => item.orders.map(o => o.order_id))).size;
  }

  private sortItems(items: ItemToOrder[]): ItemToOrder[] {
    const sorted = [...items];
    switch (this.sortMode) {
      case 'remaining':
        sorted.sort((a, b) => {
          const cmp = b.remaining - a.remaining;
          if (cmp !== 0) return cmp;
          return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
        });
        break;
      case 'location':
        sorted.sort((a, b) => {
          const locA = a.location || '';
          const locB = b.location || '';
          if (!locA && locB) return 1;
          if (locA && !locB) return -1;
          if (!locA && !locB) return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
          const cmp = locA.localeCompare(locB, undefined, { numeric: true });
          if (cmp !== 0) return cmp;
          return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
        });
        break;
      case 'part_number':
      default:
        sorted.sort((a, b) => a.part_number.localeCompare(b.part_number, undefined, { numeric: true }));
        break;
    }
    return sorted;
  }

  // Order filter actions
  toggleOrder(orderId: string): void {
    if (this.selectedOrders.has(orderId)) {
      this.selectedOrders.delete(orderId);
    } else {
      this.selectedOrders.add(orderId);
    }
    this.selectedOrders = new Set(this.selectedOrders);
  }

  selectAllOrders(): void {
    this.selectedOrders = new Set(this.uniqueOrders.map(o => o.id));
  }

  deselectAllOrders(): void {
    this.selectedOrders = new Set();
  }

  // Location filter actions
  toggleLocation(location: string): void {
    if (this.selectedLocations.has(location)) {
      this.selectedLocations.delete(location);
    } else {
      this.selectedLocations.add(location);
    }
    this.selectedLocations = new Set(this.selectedLocations);
  }

  selectAllLocations(): void {
    this.selectedLocations = new Set(this.uniqueLocations);
  }

  deselectAllLocations(): void {
    this.selectedLocations = new Set();
  }

  // Assembly filter
  get uniqueAssemblies(): string[] {
    const models = new Set<string>();
    this.currentItems.forEach(item => {
      item.orders.forEach(o => {
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

  onSortChange(): void {
    localStorage.setItem(ITEMS_TO_ORDER_SORT_KEY, this.sortMode);
  }

  clearFilters(): void {
    this.selectedOrders = new Set();
    this.selectedLocations = new Set();
    this.selectedAssemblies = new Set();
  }

  async handleExport(): Promise<void> {
    await this.excelService.exportItemsToOrderToExcel(this.filteredItems);
  }

  async handleCopyPartNumbers(): Promise<void> {
    const partNumbers = this.filteredItems.map(item => item.part_number).join('\n');
    try {
      await navigator.clipboard.writeText(partNumbers);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  async openPartDetail(partNumber: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const part = await this.partsService.getPartByPartNumber(partNumber);
    if (part) {
      const modalRef = this.modalService.open(PartDetailComponent, {
        size: 'lg',
        scrollable: true
      });
      modalRef.componentInstance.partId = part.id;
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
