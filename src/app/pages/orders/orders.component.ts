import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OrdersService } from '../../services/orders.service';
import { ExcelService } from '../../services/excel.service';
import { UtilsService } from '../../services/utils.service';
import { OrderWithProgress, Order } from '../../models';

type SortOption = 'created' | 'due-date' | 'so-number';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div>
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h1 class="h3 fw-bold mb-1">Orders</h1>
          <p class="text-muted mb-0">Manage your sales orders and track picking progress</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" (click)="handleExportOrders()">
            <i class="bi bi-download me-1"></i> Export
          </button>
          <a routerLink="/import" class="btn btn-outline-secondary">
            <i class="bi bi-upload me-1"></i> Import
          </a>
          <button class="btn btn-primary" (click)="showNewOrderModal = true">
            <i class="bi bi-plus me-1"></i> New Order
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-3 align-items-center">
            <div class="col-md-4">
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control" placeholder="Search by SO#, PO#, or customer..."
                       [(ngModel)]="searchQuery">
              </div>
            </div>
            <div class="col-md-8">
              <div class="d-flex flex-wrap gap-2">
                <button *ngFor="let status of ['all', 'active', 'complete', 'cancelled']"
                        class="btn btn-sm"
                        [class.btn-primary]="statusFilter === status"
                        [class.btn-outline-secondary]="statusFilter !== status"
                        (click)="statusFilter = status">
                  <i class="bi me-1" [ngClass]="{
                    'bi-check-circle': status === 'complete',
                    'bi-x-circle': status === 'cancelled',
                    'bi-clock': status === 'active'
                  }" *ngIf="status !== 'all'"></i>
                  {{ status | titlecase }}
                </button>
                <div class="vr mx-2"></div>
                <button *ngIf="statusFilter === 'all'"
                        class="btn btn-sm"
                        [class.btn-primary]="hideCompleted"
                        [class.btn-outline-secondary]="!hideCompleted"
                        (click)="hideCompleted = !hideCompleted">
                  <i class="bi" [ngClass]="hideCompleted ? 'bi-eye-slash' : 'bi-eye'"></i>
                  {{ hideCompleted ? 'Hidden' : 'Completed' }}
                </button>
                <button class="btn btn-sm btn-outline-secondary" (click)="cycleSortBy()">
                  <i class="bi bi-arrow-down-up me-1"></i>
                  {{ sortBy === 'due-date' ? 'Due Date' : sortBy === 'created' ? 'Created' : 'SO#' }}
                </button>
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
                               [id]="'assembly-' + model"
                               [checked]="selectedAssemblies.has(model)"
                               (change)="toggleAssembly(model)">
                        <label class="form-check-label" [for]="'assembly-' + model">
                          {{ model }}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Orders List -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading orders...</div>
      </div>

      <div *ngIf="!loading && filteredOrders.length === 0" class="card">
        <div class="card-body text-center py-5">
          <p class="text-muted">
            {{ searchQuery || statusFilter !== 'all' ? 'No orders match your filters' : 'No orders yet. Import or create one to get started.' }}
          </p>
          <div *ngIf="!searchQuery && statusFilter === 'all'" class="d-flex justify-content-center gap-2 mt-3">
            <a routerLink="/import" class="btn btn-primary">Import Order</a>
            <button class="btn btn-outline-secondary" (click)="showNewOrderModal = true">Create Manually</button>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && filteredOrders.length > 0" class="d-flex flex-column gap-3">
        <div *ngFor="let order of filteredOrders" class="card card-hover"
             [class.border-start]="true"
             [class.border-success]="order.status === 'complete'"
             [class.border-secondary]="order.status === 'cancelled'"
             [class.border-danger]="order.status === 'active' && utils.getDueDateStatus(order.due_date).status === 'overdue'"
             [class.border-warning]="order.status === 'active' && utils.getDueDateStatus(order.due_date).status === 'due-soon'"
             [style.border-left-width]="'4px'"
             [class.opacity-75]="order.status === 'complete'"
             [class.opacity-50]="order.status === 'cancelled'">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <a [routerLink]="['/orders', order.id]" class="h5 mb-0 text-decoration-none">
                    SO-{{ order.so_number }}
                  </a>
                  <span class="badge" [ngClass]="utils.getStatusBadgeClass(order.status)">{{ order.status }}</span>
                  <span *ngIf="order.status === 'active' && utils.getDueDateStatus(order.due_date).status !== 'no-date'"
                        class="badge"
                        [ngClass]="utils.getDueDateBadgeClass(utils.getDueDateStatus(order.due_date).status)">
                    <i class="bi me-1" [ngClass]="{
                      'bi-exclamation-circle': utils.getDueDateStatus(order.due_date).status === 'overdue',
                      'bi-clock': utils.getDueDateStatus(order.due_date).status === 'due-soon'
                    }"></i>
                    {{ utils.getDueDateStatus(order.due_date).label }}
                  </span>
                </div>
                <div class="d-flex flex-wrap gap-3 small text-muted">
                  <span *ngIf="order.tool_model" class="fw-medium">{{ order.tool_model }}</span>
                  <span *ngIf="order.customer_name">{{ order.customer_name }}</span>
                  <span *ngIf="order.po_number">PO: {{ order.po_number }}</span>
                  <span *ngIf="order.due_date" [class.text-danger]="order.status === 'active' && utils.getDueDateStatus(order.due_date).status === 'overdue'">
                    Due: {{ utils.formatDate(order.due_date) }}
                  </span>
                  <span>{{ order.tools.length }} tool(s)</span>
                </div>
              </div>

              <div class="d-flex align-items-center gap-3">
                <div style="width: 150px;">
                  <div class="d-flex justify-content-between small mb-1">
                    <span class="fw-medium">{{ order.progress_percent }}%</span>
                    <span class="text-muted">{{ order.picked_items }}/{{ order.total_items }} parts</span>
                  </div>
                  <div class="progress" style="height: 8px;">
                    <div class="progress-bar" [style.width.%]="order.progress_percent"></div>
                  </div>
                </div>

                <div class="d-flex gap-2">
                  <a [routerLink]="['/orders', order.id]"
                     class="btn btn-sm"
                     [class.btn-outline-secondary]="order.status === 'complete' || order.status === 'cancelled'"
                     [class.btn-primary]="order.status === 'active'">
                    {{ order.status === 'active' ? 'Pick' : 'View' }}
                  </a>
                  <button class="btn btn-sm btn-outline-danger" (click)="handleDeleteOrder(order)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- New Order Modal -->
      <div class="modal fade" [class.show]="showNewOrderModal" [style.display]="showNewOrderModal ? 'block' : 'none'"
           tabindex="-1" (click)="closeModalOnBackdrop($event)">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Create New Order</h5>
              <button type="button" class="btn-close" (click)="showNewOrderModal = false"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">SO Number *</label>
                  <input type="text" class="form-control" placeholder="e.g., 3137" [(ngModel)]="newOrder.so_number">
                </div>
                <div class="col-md-6">
                  <label class="form-label">PO Number</label>
                  <input type="text" class="form-control" placeholder="Customer PO" [(ngModel)]="newOrder.po_number">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Customer</label>
                  <input type="text" class="form-control" placeholder="Customer name" [(ngModel)]="newOrder.customer_name">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Tool Model</label>
                  <input type="text" class="form-control" placeholder="e.g., 230Q, NG1" [(ngModel)]="newOrder.tool_model">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Quantity (# of Tools)</label>
                  <input type="number" class="form-control" min="1" placeholder="1" [(ngModel)]="newOrder.quantity">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Order Date</label>
                  <input type="date" class="form-control" [(ngModel)]="newOrder.order_date">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Due Date</label>
                  <input type="date" class="form-control" [(ngModel)]="newOrder.due_date">
                </div>
                <div class="col-12">
                  <label class="form-label">Notes</label>
                  <input type="text" class="form-control" placeholder="Any additional notes..." [(ngModel)]="newOrder.notes">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showNewOrderModal = false">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="handleCreateOrder()" [disabled]="!newOrder.so_number.trim()">
                Create Order
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showNewOrderModal"></div>
    </div>
  `
})
export class OrdersComponent implements OnInit, OnDestroy {
  orders: OrderWithProgress[] = [];
  loading = true;
  searchQuery = '';
  statusFilter = 'active';
  hideCompleted = false;
  sortBy: SortOption = 'due-date';
  selectedAssemblies = new Set<string>();
  showNewOrderModal = false;

  newOrder = {
    so_number: '',
    po_number: '',
    customer_name: '',
    tool_model: '',
    quantity: 1,
    order_date: '',
    due_date: '',
    notes: '',
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private ordersService: OrdersService,
    private excelService: ExcelService,
    public utils: UtilsService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.ordersService.orders$.subscribe(orders => {
        this.orders = orders;
      }),
      this.ordersService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get filteredOrders(): OrderWithProgress[] {
    let filtered = this.orders.filter(order => {
      const matchesSearch =
        order.so_number.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        order.po_number?.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        order.customer_name?.toLowerCase().includes(this.searchQuery.toLowerCase());

      const matchesStatus = this.statusFilter === 'all' || order.status === this.statusFilter;
      const matchesHideCompleted = !this.hideCompleted || order.status !== 'complete';
      const matchesAssembly = this.selectedAssemblies.size === 0 ||
        (!!order.tool_model && this.selectedAssemblies.has(order.tool_model));

      return matchesSearch && matchesStatus && matchesHideCompleted && matchesAssembly;
    });

    return [...filtered].sort((a, b) => {
      switch (this.sortBy) {
        case 'due-date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'so-number':
          return a.so_number.localeCompare(b.so_number, undefined, { numeric: true });
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }

  get uniqueAssemblies(): string[] {
    const models = new Set<string>();
    this.orders.forEach(o => {
      if (o.tool_model) models.add(o.tool_model);
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

  cycleSortBy(): void {
    const options: SortOption[] = ['due-date', 'created', 'so-number'];
    const currentIndex = options.indexOf(this.sortBy);
    this.sortBy = options[(currentIndex + 1) % options.length];
  }

  async handleCreateOrder(): Promise<void> {
    if (!this.newOrder.so_number.trim()) return;

    await this.ordersService.createOrder({
      so_number: this.newOrder.so_number.trim(),
      po_number: this.newOrder.po_number.trim() || null,
      customer_name: this.newOrder.customer_name.trim() || null,
      tool_model: this.newOrder.tool_model.trim() || null,
      quantity: this.newOrder.quantity || 1,
      order_date: this.newOrder.order_date || null,
      due_date: this.newOrder.due_date || null,
      notes: this.newOrder.notes.trim() || null,
    });

    this.resetNewOrder();
    this.showNewOrderModal = false;
  }

  async handleDeleteOrder(order: OrderWithProgress): Promise<void> {
    if (confirm(`Delete order SO-${order.so_number}? This cannot be undone.`)) {
      await this.ordersService.deleteOrder(order.id);
    }
  }

  async handleExportOrders(): Promise<void> {
    await this.excelService.exportOrdersSummaryToExcel(this.orders);
  }

  closeModalOnBackdrop(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.showNewOrderModal = false;
    }
  }

  private resetNewOrder(): void {
    this.newOrder = {
      so_number: '',
      po_number: '',
      customer_name: '',
      tool_model: '',
      quantity: 1,
      order_date: '',
      due_date: '',
      notes: '',
    };
  }
}
