import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ItemsToOrderService } from '../../services/consolidated-parts.service';
import { UtilsService } from '../../services/utils.service';
import { ExcelService } from '../../services/excel.service';
import { ItemToOrder } from '../../models';

@Component({
  selector: 'app-items-to-order',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div>
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h1 class="h3 fw-bold mb-1">Items to Order</h1>
          <p class="text-muted mb-0">Parts with no stock available that still need to be picked</p>
        </div>
        <button class="btn btn-outline-primary" (click)="handleExport()" [disabled]="filteredItems.length === 0">
          <i class="bi bi-download me-2"></i>Export
        </button>
      </div>

      <!-- Info Alert -->
      <div class="alert alert-info d-flex align-items-center mb-4" *ngIf="!loading && items.length > 0">
        <i class="bi bi-info-circle me-2"></i>
        <span>Showing {{ items.length }} part(s) that have qty_available = 0 and still have remaining quantity to pick.</span>
      </div>

      <!-- Filters -->
      <div class="card mb-4" *ngIf="items.length > 0">
        <div class="card-body">
          <div class="d-flex flex-column flex-sm-row gap-3 align-items-sm-center">
            <div class="input-group flex-grow-1">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" placeholder="Search by part number or description..."
                     [(ngModel)]="searchQuery">
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="hideAlreadyOrdered"
                     [checked]="hideAlreadyOrdered" (change)="toggleHideAlreadyOrdered()">
              <label class="form-check-label text-nowrap" for="hideAlreadyOrdered">
                Hide already ordered
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading...</div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && items.length === 0" class="card">
        <div class="card-body text-center py-5">
          <i class="bi bi-check-circle display-4 text-success mb-3"></i>
          <p class="text-muted mb-0">No items to order - all parts have stock available!</p>
        </div>
      </div>

      <!-- Items List -->
      <div *ngIf="!loading && filteredItems.length > 0" class="card">
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
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItems">
                <td class="font-mono fw-medium">{{ item.part_number }}</td>
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

      <div *ngIf="!loading && items.length > 0 && filteredItems.length === 0" class="card">
        <div class="card-body text-center py-5 text-muted">
          No items match your search
        </div>
      </div>
    </div>
  `
})
export class ItemsToOrderComponent implements OnInit, OnDestroy {
  items: ItemToOrder[] = [];
  loading = true;
  searchQuery = '';
  hideAlreadyOrdered = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private itemsToOrderService: ItemsToOrderService,
    private excelService: ExcelService,
    public utils: UtilsService
  ) {
    // Load hide already ordered preference from localStorage
    const saved = localStorage.getItem('items-to-order-hide-already-ordered');
    this.hideAlreadyOrdered = saved === 'true';
  }

  ngOnInit(): void {
    this.subscriptions.push(
      this.itemsToOrderService.items$.subscribe(items => {
        this.items = items;
      }),
      this.itemsToOrderService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get filteredItems(): ItemToOrder[] {
    return this.items.filter(item => {
      // Search filter
      const matchesSearch = !this.searchQuery ||
        item.part_number.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(this.searchQuery.toLowerCase());

      // Hide items that have already been ordered (qty_on_order > 0)
      const matchesAlreadyOrdered = !this.hideAlreadyOrdered ||
        !item.qty_on_order ||
        item.qty_on_order <= 0;

      return matchesSearch && matchesAlreadyOrdered;
    });
  }

  toggleHideAlreadyOrdered(): void {
    this.hideAlreadyOrdered = !this.hideAlreadyOrdered;
    localStorage.setItem('items-to-order-hide-already-ordered', String(this.hideAlreadyOrdered));
  }

  handleExport(): void {
    this.excelService.exportItemsToOrderToExcel(this.filteredItems);
  }
}
