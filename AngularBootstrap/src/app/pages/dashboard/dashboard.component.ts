import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrdersService } from '../../services/orders.service';
import { RecentActivityService } from '../../services/picks.service';
import { ConsolidatedPartsService, ItemsToOrderService } from '../../services/consolidated-parts.service';
import { UtilsService } from '../../services/utils.service';
import { OrderWithProgress, RecentActivity, ConsolidatedPart, ItemToOrder } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-4">
      <div class="mb-4">
        <h1 class="h3 fw-bold">Dashboard</h1>
        <p class="text-muted">Overview of your pick list progress</p>
      </div>

      <!-- Stats Grid -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3" *ngFor="let stat of stats">
          <div class="card stat-card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <p class="text-muted small mb-1">{{ stat.title }}</p>
                  <h3 class="mb-0 fw-bold">{{ loading ? '...' : stat.value | number }}</h3>
                </div>
                <div class="stat-icon" [ngClass]="stat.bgColor">
                  <i class="bi" [ngClass]="stat.icon" [class]="stat.color"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Due Soon Section -->
      <div class="card mb-4 alert-left-border border-start-warning" *ngIf="!loading && dueSoonOrders.length > 0">
        <div class="card-header bg-warning bg-opacity-10 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <i class="bi bi-exclamation-triangle text-warning me-2" *ngIf="overdueCount === 0"></i>
            <i class="bi bi-exclamation-circle text-danger me-2" *ngIf="overdueCount > 0"></i>
            <span class="fw-semibold" [class.text-danger]="overdueCount > 0" [class.text-warning]="overdueCount === 0">
              {{ overdueCount > 0 ? (overdueCount + ' Overdue Order' + (overdueCount > 1 ? 's' : '')) : (dueSoonOrders.length + ' Order' + (dueSoonOrders.length > 1 ? 's' : '') + ' Due Soon') }}
            </span>
          </div>
          <a routerLink="/orders" [queryParams]="{sort: 'due-date'}" class="btn btn-sm btn-outline-secondary">
            View All <i class="bi bi-arrow-right ms-1"></i>
          </a>
        </div>
        <div class="card-body">
          <div class="list-group list-group-flush">
            <a *ngFor="let order of dueSoonOrders.slice(0, 5)"
               [routerLink]="['/orders', order.id]"
               class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
              <div>
                <span class="fw-medium">SO-{{ order.so_number }}</span>
                <span class="badge ms-2" [ngClass]="utils.getDueDateBadgeClass(utils.getDueDateStatus(order.due_date).status)">
                  {{ utils.getDueDateStatus(order.due_date).label }}
                </span>
                <div class="small text-muted">
                  {{ order.customer_name || (order.tools.length + ' tool(s)') }}
                  <span *ngIf="order.due_date"> - Due: {{ utils.formatDate(order.due_date) }}</span>
                </div>
              </div>
              <div class="text-end" style="width: 100px;">
                <div class="small fw-medium">{{ order.progress_percent }}%</div>
                <div class="progress" style="height: 6px;">
                  <div class="progress-bar" [style.width.%]="order.progress_percent"></div>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>

      <!-- Items to Order Section -->
      <div class="card mb-4 alert-left-border" style="border-left-color: var(--bs-warning) !important;" *ngIf="!itemsToOrderLoading && itemsToOrder.length > 0">
        <div class="card-header bg-warning bg-opacity-10 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <i class="bi bi-cart text-warning me-2"></i>
            <span class="fw-semibold text-warning">{{ itemsToOrder.length }} Part{{ itemsToOrder.length > 1 ? 's' : '' }} to Order</span>
          </div>
          <a routerLink="/items-to-order" class="btn btn-sm btn-outline-secondary">
            View All <i class="bi bi-arrow-right ms-1"></i>
          </a>
        </div>
        <div class="card-body">
          <p class="small text-muted mb-3">Parts with no stock available that still need to be picked</p>
          <div class="list-group list-group-flush">
            <div *ngFor="let item of itemsToOrder.slice(0, 5)"
                 class="list-group-item d-flex justify-content-between align-items-center">
              <div class="text-truncate">
                <div class="d-flex align-items-center gap-2">
                  <span class="font-mono fw-medium">{{ item.part_number }}</span>
                  <button class="btn btn-sm btn-ghost p-0 text-muted" (click)="copyPartNumber(item.part_number, $event)" title="Copy Part Number">
                    <i class="bi" [ngClass]="copiedPartNumber === item.part_number ? 'bi-check-lg text-success' : 'bi-copy'"></i>
                  </button>
                </div>
                <div class="small text-muted text-truncate" *ngIf="item.description">{{ item.description }}</div>
              </div>
              <span class="badge bg-warning text-dark rounded-pill ms-2">{{ item.remaining }} needed</span>
            </div>
          </div>
          <p class="small text-muted text-center mt-2 mb-0" *ngIf="itemsToOrder.length > 5">
            +{{ itemsToOrder.length - 5 }} more items
          </p>
        </div>
      </div>

      <div class="row g-4">
        <!-- Active Orders -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-semibold">Active Orders</span>
              <a routerLink="/orders" class="btn btn-sm btn-outline-primary">
                View All <i class="bi bi-arrow-right ms-1"></i>
              </a>
            </div>
            <div class="card-body">
              <div *ngIf="loading" class="text-center py-4 text-muted">Loading...</div>
              <div *ngIf="!loading && activeOrders.length === 0" class="text-center py-4">
                <p class="text-muted mb-3">No active orders</p>
                <a routerLink="/import" class="btn btn-primary">Import an Order</a>
              </div>
              <div class="list-group list-group-flush" *ngIf="!loading && activeOrders.length > 0">
                <a *ngFor="let order of activeOrders.slice(0, 5)"
                   [routerLink]="['/orders', order.id]"
                   class="list-group-item list-group-item-action">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <span class="fw-medium">SO-{{ order.so_number }}</span>
                      <div class="small text-muted">{{ order.tools.length }} tool(s)</div>
                    </div>
                    <div class="text-end" style="width: 120px;">
                      <div class="d-flex justify-content-between small mb-1">
                        <span>{{ order.progress_percent }}%</span>
                        <span class="text-muted">{{ order.picked_items }}/{{ order.total_items }}</span>
                      </div>
                      <div class="progress" style="height: 6px;">
                        <div class="progress-bar" [style.width.%]="order.progress_percent"></div>
                      </div>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header">
              <span class="fw-semibold">Recent Activity</span>
            </div>
            <div class="card-body">
              <div *ngIf="activityLoading" class="text-center py-4 text-muted">Loading...</div>
              <div *ngIf="!activityLoading && activities.length === 0" class="text-center py-4 text-muted">
                No recent activity
              </div>
              <div *ngIf="!activityLoading && activities.length > 0">
                <div *ngFor="let activity of activities.slice(0, 8)" class="d-flex align-items-start mb-3">
                  <i *ngIf="activity.type === 'pick_undo'" class="bi bi-arrow-counterclockwise text-danger me-2 mt-1"></i>
                  <i *ngIf="activity.type !== 'pick_undo'" class="bi bi-check-circle-fill text-success me-2 mt-1"></i>
                  <div class="flex-grow-1">
                    <p class="mb-0 small" [class.text-danger]="activity.type === 'pick_undo'">{{ activity.message }}</p>
                    <p class="text-muted small mb-0">{{ activity.user }} - SO-{{ activity.so_number }}</p>
                  </div>
                  <small class="text-muted">{{ utils.formatRelativeTime(activity.timestamp) }}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit, OnDestroy {
  orders: OrderWithProgress[] = [];
  activities: RecentActivity[] = [];
  parts: ConsolidatedPart[] = [];
  itemsToOrder: ItemToOrder[] = [];

  loading = true;
  activityLoading = true;
  itemsToOrderLoading = true;

  stats: any[] = [];

  copiedPartNumber: string | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private ordersService: OrdersService,
    private activityService: RecentActivityService,
    private partsService: ConsolidatedPartsService,
    private itemsToOrderService: ItemsToOrderService,
    public utils: UtilsService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.ordersService.orders$.subscribe(orders => {
        this.orders = orders;
        this.updateStats();
      }),
      this.ordersService.loading$.subscribe(loading => {
        this.loading = loading;
      }),
      this.activityService.activities$.subscribe(activities => {
        this.activities = activities;
      }),
      this.activityService.loading$.subscribe(loading => {
        this.activityLoading = loading;
      }),
      this.partsService.parts$.subscribe(parts => {
        this.parts = parts;
        this.updateStats();
      }),
      this.itemsToOrderService.items$.subscribe(items => {
        this.itemsToOrder = items;
      }),
      this.itemsToOrderService.loading$.subscribe(loading => {
        this.itemsToOrderLoading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get activeOrders(): OrderWithProgress[] {
    return this.orders.filter(o => o.status === 'active');
  }

  get completedOrders(): OrderWithProgress[] {
    return this.orders.filter(o => o.status === 'complete');
  }

  get dueSoonOrders(): OrderWithProgress[] {
    return this.activeOrders
      .filter(order => this.utils.isDueSoon(order.due_date, 3))
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
  }

  get overdueCount(): number {
    return this.dueSoonOrders.filter(o => this.utils.getDueDateStatus(o.due_date).status === 'overdue').length;
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

  private updateStats(): void {
    const totalParts = this.parts.reduce((sum, p) => sum + p.total_needed, 0);
    const pickedParts = this.parts.reduce((sum, p) => sum + p.total_picked, 0);
    const remainingParts = totalParts - pickedParts;

    this.stats = [
      {
        title: 'Active Orders',
        value: this.activeOrders.length,
        icon: 'bi-clipboard-data',
        color: 'text-primary',
        bgColor: 'bg-primary bg-opacity-10',
      },
      {
        title: 'Parts Remaining',
        value: remainingParts,
        icon: 'bi-box-seam',
        color: 'text-warning',
        bgColor: 'bg-warning bg-opacity-10',
      },
      {
        title: 'Parts Picked',
        value: pickedParts,
        icon: 'bi-check-circle',
        color: 'text-success',
        bgColor: 'bg-success bg-opacity-10',
      },
      {
        title: 'Completed Orders',
        value: this.completedOrders.length,
        icon: 'bi-clock-history',
        color: 'text-info',
        bgColor: 'bg-info bg-opacity-10',
      },
    ];
  }
}
