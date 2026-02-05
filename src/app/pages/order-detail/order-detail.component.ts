import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OrdersService } from '../../services/orders.service';
import { PicksService } from '../../services/picks.service';
import { LineItemsService } from '../../services/line-items.service';
import { IssuesService } from '../../services/issues.service';
import { SettingsService } from '../../services/settings.service';
import { ExcelService } from '../../services/excel.service';
import { UtilsService } from '../../services/utils.service';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { ActivityLogService } from '../../services/activity-log.service';
import { Order, Tool, LineItem, LineItemWithPicks, Pick, IssueType } from '../../models';
import { SaveAsTemplateDialogComponent } from '../../components/dialogs/save-as-template-dialog.component';
import { PrintPickListComponent } from '../../components/picking/print-pick-list.component';
import { PrintTagDialogComponent, TagData } from '../../components/picking/print-tag-dialog.component';
import { DistributeInventoryDialogComponent } from '../../components/dialogs/distribute-inventory-dialog.component';

type SortMode = 'part_number' | 'location' | 'assembly';

interface PickHistoryItem {
  pick: Pick;
  toolNumber: string;
}

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SaveAsTemplateDialogComponent, PrintPickListComponent, PrintTagDialogComponent, DistributeInventoryDialogComponent],
  template: `
    <div *ngIf="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="text-muted mt-3">Loading order...</p>
    </div>

    <div *ngIf="!loading && !order" class="text-center py-5">
      <a routerLink="/orders" class="btn btn-link mb-3">
        <i class="bi bi-arrow-left me-1"></i> Back to Orders
      </a>
      <div class="card">
        <div class="card-body">
          <p class="text-muted">Order not found</p>
        </div>
      </div>
    </div>

    <div *ngIf="!loading && order">
      <!-- Completion Banner -->
      <div class="alert alert-success d-flex align-items-center mb-3" *ngIf="isFullyPicked && order.status === 'active'">
        <i class="bi bi-check-circle-fill me-2"></i>
        <div class="flex-grow-1">
          <strong>All items picked!</strong> This order is ready to be marked complete.
        </div>
        <button class="btn btn-success btn-sm" (click)="handleMarkComplete()">
          <i class="bi bi-check-circle me-1"></i> Mark Complete
        </button>
      </div>

      <!-- Status Banners -->
      <div class="alert alert-success d-flex align-items-center mb-3" *ngIf="order.status === 'complete'">
        <i class="bi bi-check-circle-fill me-2"></i>
        <strong>Order Complete</strong>
      </div>

      <div class="alert alert-secondary d-flex align-items-center mb-3" *ngIf="order.status === 'cancelled'">
        <i class="bi bi-x-circle-fill me-2"></i>
        <strong>Order Cancelled</strong>
      </div>

      <div class="alert alert-danger d-flex align-items-center mb-3"
           *ngIf="order.status === 'active' && utils.getDueDateStatus(order.due_date).status === 'overdue'">
        <i class="bi bi-exclamation-circle-fill me-2"></i>
        <strong>Order Overdue</strong> - Due on {{ utils.formatDate(order.due_date) }}
      </div>

      <div class="alert alert-warning d-flex align-items-center mb-3"
           *ngIf="order.status === 'active' && utils.getDueDateStatus(order.due_date).status === 'due-soon'">
        <i class="bi bi-clock-fill me-2"></i>
        <strong>{{ utils.getDueDateStatus(order.due_date).label }}</strong> - {{ utils.formatDate(order.due_date) }}
      </div>

      <!-- Over-Pick Warning Alert -->
      <div class="alert alert-danger d-flex align-items-center mb-3" *ngIf="overPickWarning">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        <div class="flex-grow-1">
          <strong>Concurrent Pick Detected</strong>
          <p class="mb-0 small">{{ overPickWarning }}</p>
        </div>
        <button type="button" class="btn-close" (click)="overPickWarning = null" aria-label="Close"></button>
      </div>

      <!-- Header -->
      <div class="mb-3">
        <a routerLink="/orders" class="text-decoration-none small">
          <i class="bi bi-arrow-left me-1"></i> Back to Orders
        </a>
        <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
          <h1 class="h4 fw-bold mb-0">SO-{{ order.so_number }}</h1>
          <select class="form-select form-select-sm w-auto" [(ngModel)]="order.status" (change)="handleStatusChange()">
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button class="btn btn-outline-secondary btn-sm" (click)="handleExport()">
            <i class="bi bi-download me-1"></i> Export
          </button>
          <button class="btn btn-outline-secondary btn-sm" (click)="showPrintModal = true" title="Print Pick List">
            <i class="bi bi-printer me-1"></i> Print
          </button>
          <button class="btn btn-outline-secondary btn-sm" (click)="showSaveTemplateModal = true" title="Save as BOM Template">
            <i class="bi bi-save me-1"></i> Template
          </button>

          <!-- Progress -->
          <div class="d-flex align-items-center gap-2 ms-auto bg-body-secondary rounded px-3 py-2">
            <span class="small text-muted">Progress:</span>
            <div class="progress" style="width: 100px; height: 8px;">
              <div class="progress-bar" [style.width.%]="progressPercent"></div>
            </div>
            <span class="small fw-semibold">{{ progressPercent }}%</span>
            <span class="small text-muted">({{ completedLineItems }}/{{ totalLineItems }} parts)</span>
          </div>

          <button class="btn btn-success btn-sm" *ngIf="isFullyPicked && order.status === 'active'" (click)="handleMarkComplete()">
            <i class="bi bi-check-circle me-1"></i> Mark Complete
          </button>
        </div>
      </div>

      <!-- Order Info Card -->
      <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center cursor-pointer"
             (click)="!isEditing && (isOrderInfoExpanded = !isOrderInfoExpanded)">
          <div class="d-flex align-items-center">
            <i class="bi me-2" [ngClass]="isOrderInfoExpanded ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
            <span class="fw-semibold">Order Information</span>
            <span class="text-muted small ms-2" *ngIf="!isOrderInfoExpanded && !isEditing">
              {{ getOrderSummary() }}
            </span>
          </div>
          <button *ngIf="!isEditing" class="btn btn-outline-secondary btn-sm" (click)="startEditing(); $event.stopPropagation()">
            <i class="bi bi-pencil me-1"></i> Edit
          </button>
          <div *ngIf="isEditing" class="d-flex gap-2" (click)="$event.stopPropagation()">
            <button class="btn btn-outline-secondary btn-sm" (click)="cancelEditing()">Cancel</button>
            <button class="btn btn-primary btn-sm" (click)="saveChanges()">Save</button>
          </div>
        </div>
        <div class="card-body" *ngIf="isOrderInfoExpanded || isEditing">
          <!-- View Mode -->
          <div class="row g-3" *ngIf="!isEditing">
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">SO Number</p>
              <p class="fw-medium mb-0">{{ order.so_number }}</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">Customer</p>
              <p class="fw-medium mb-0">{{ order.customer_name || '-' }}</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">PO Number</p>
              <p class="fw-medium mb-0">{{ order.po_number || '-' }}</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">Tool Model</p>
              <p class="fw-medium mb-0">{{ order.tool_model || '-' }}</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">Tools</p>
              <p class="fw-medium mb-0">{{ tools.length }} tool(s)</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">Order Date</p>
              <p class="fw-medium mb-0">{{ utils.formatDate(order.order_date) }}</p>
            </div>
            <div class="col-6 col-md-3">
              <p class="text-muted small mb-1">Due Date</p>
              <p class="fw-medium mb-0">{{ utils.formatDate(order.due_date) }}</p>
            </div>
            <div class="col-12">
              <p class="text-muted small mb-1">Notes</p>
              <p class="fw-medium mb-0">{{ order.notes || '-' }}</p>
            </div>
          </div>
          <!-- Edit Mode -->
          <div class="row g-3" *ngIf="isEditing">
            <div class="col-md-3">
              <label class="form-label small">SO Number</label>
              <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.so_number">
            </div>
            <div class="col-md-3">
              <label class="form-label small">Customer</label>
              <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.customer_name">
            </div>
            <div class="col-md-3">
              <label class="form-label small">PO Number</label>
              <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.po_number">
            </div>
            <div class="col-md-3">
              <label class="form-label small">Tool Model</label>
              <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.tool_model">
            </div>
            <div class="col-md-3">
              <label class="form-label small">Order Date</label>
              <input type="date" class="form-control form-control-sm" [(ngModel)]="editForm.order_date">
            </div>
            <div class="col-md-3">
              <label class="form-label small">Due Date</label>
              <input type="date" class="form-control form-control-sm" [(ngModel)]="editForm.due_date">
            </div>
            <div class="col-md-6">
              <label class="form-label small">Notes</label>
              <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.notes">
            </div>
          </div>
        </div>
      </div>

      <!-- Picking Interface -->
      <div *ngIf="tools.length === 0" class="card">
        <div class="card-body text-center py-5">
          <i class="bi bi-box-seam display-4 text-muted mb-3"></i>
          <p class="text-muted">No tools defined for this order</p>
          <p class="small text-muted">Import an Excel file with tool definitions or add tools manually</p>
          <button class="btn btn-primary mt-2" (click)="showAddToolModal = true">
            <i class="bi bi-plus me-1"></i> Add Tool
          </button>
        </div>
      </div>

      <div *ngIf="tools.length > 0">
        <!-- Picking Header -->
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h2 class="h6 fw-semibold mb-0">Picking</h2>
          <span class="badge bg-secondary">{{ lineItems.length }} parts</span>
          <span class="badge bg-body-secondary text-body border">{{ tools.length }} tool(s)</span>

          <!-- Part Search Input -->
          <div class="input-group" style="width: 180px;">
            <span class="input-group-text py-1 px-2"><i class="bi bi-search small"></i></span>
            <input
              type="text"
              class="form-control form-control-sm"
              placeholder="Search parts..."
              [(ngModel)]="partSearchQuery"
            >
            <button
              *ngIf="partSearchQuery"
              class="btn btn-outline-secondary btn-sm"
              type="button"
              (click)="partSearchQuery = ''"
            >
              <i class="bi bi-x"></i>
            </button>
          </div>

          <!-- Sort Dropdown -->
          <div class="dropdown">
            <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
              <i class="bi bi-sort-down me-1"></i>
              {{ sortMode === 'part_number' ? 'Part Number' : (sortMode === 'location' ? 'Location' : 'Assembly') }}
            </button>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item" [class.active]="sortMode === 'part_number'" (click)="setSortMode('part_number')">Sort by Part Number</a></li>
              <li><a class="dropdown-item" [class.active]="sortMode === 'location'" (click)="setSortMode('location')">Sort by Location</a></li>
              <li><a class="dropdown-item" [class.active]="sortMode === 'assembly'" (click)="setSortMode('assembly')">Sort by Assembly</a></li>
            </ul>
          </div>

          <!-- Hide Completed Toggle -->
          <button class="btn btn-sm" [ngClass]="hideCompleted ? 'btn-primary' : 'btn-outline-secondary'"
                  (click)="toggleHideCompleted()" title="Hide fully picked items">
            <i class="bi" [ngClass]="hideCompleted ? 'bi-eye-slash-fill' : 'bi-eye'"></i>
            <span class="d-none d-md-inline ms-1">{{ hideCompleted ? 'Show All' : 'Hide Done' }}</span>
          </button>

          <!-- Out of Stock Filter -->
          <button class="btn btn-sm" [ngClass]="showOutOfStockOnly ? 'btn-warning' : 'btn-outline-secondary'"
                  (click)="toggleShowOutOfStockOnly()" title="Show only items with zero stock">
            <i class="bi bi-exclamation-triangle"></i>
            <span class="d-none d-md-inline ms-1">Out of Stock</span>
            <span class="badge bg-secondary ms-1" *ngIf="outOfStockCount > 0">{{ outOfStockCount }}</span>
          </button>

          <!-- Tool Filter Dropdown (multi-tool only) -->
          <div class="dropdown" *ngIf="tools.length > 1">
            <button class="btn btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown"
                    [ngClass]="toolFilter ? 'btn-primary' : 'btn-outline-secondary'">
              <i class="bi bi-funnel me-1"></i>
              {{ toolFilter ? getToolFilterLabel(toolFilter) : 'All Tools' }}
            </button>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item" [class.active]="!toolFilter" (click)="toolFilter = null">All Tools</a></li>
              <li><hr class="dropdown-divider"></li>
              <li *ngFor="let tool of tools">
                <a class="dropdown-item" [class.active]="toolFilter === tool.id" (click)="toolFilter = tool.id">
                  {{ tool.tool_number }}<span *ngIf="tool.tool_model" class="text-muted ms-1">[{{ tool.tool_model }}]</span>
                </a>
              </li>
            </ul>
          </div>

          <div class="ms-auto d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm" (click)="showManageToolsModal = true">
              <i class="bi bi-gear me-1"></i> Manage Tools
            </button>
            <button class="btn btn-outline-primary btn-sm" (click)="showAddLineItemModal = true">
              <i class="bi bi-plus me-1"></i> Add Part
            </button>
          </div>
        </div>

        <!-- Search results indicator -->
        <div *ngIf="partSearchQuery" class="small text-muted mb-2">
          {{ sortedLineItems.length }} of {{ lineItemsWithPicks.length }} parts match "{{ partSearchQuery }}"
        </div>

        <!-- Tools Header Bar -->
        <div class="card mb-2">
          <div class="card-body py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
              <span class="small text-muted">Tools:</span>
              <div class="d-flex gap-1 flex-wrap">
                <span *ngFor="let tool of tools"
                      class="badge d-flex flex-column align-items-center cursor-pointer"
                      style="padding: 0.3em 0.5em;"
                      [ngClass]="{
                        'bg-success': getToolProgress(tool.id) === 100,
                        'bg-warning text-dark': getToolProgress(tool.id) > 0 && getToolProgress(tool.id) < 100,
                        'bg-body-secondary text-body border': getToolProgress(tool.id) === 0
                      }"
                      [style.outline]="toolFilter === tool.id ? '2px solid #0d6efd' : 'none'"
                      [title]="getToolTooltip(tool)"
                      (click)="toolFilter = toolFilter === tool.id ? null : tool.id">
                  <span class="d-flex align-items-center gap-1">
                    {{ tool.tool_number }}
                    <small class="opacity-75">{{ getToolProgress(tool.id) }}%</small>
                    <i class="bi bi-check-circle-fill" *ngIf="getToolProgress(tool.id) === 100"></i>
                  </span>
                  <small *ngIf="tool.tool_model" class="opacity-75" style="font-size: 0.6rem; line-height: 1;">{{ tool.tool_model }}</small>
                </span>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="small text-muted">Total:</span>
              <span class="badge bg-primary">{{ completedLineItems }}/{{ totalLineItems }} parts</span>
            </div>
          </div>
        </div>

        <!-- Picking Table with Tool Checkboxes -->
        <div class="card">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover mb-0 align-middle">
                <thead>
                  <tr class="table-secondary">
                    <th style="width: 30px;"></th>
                    <th>Part Number</th>
                    <th>Description</th>
                    <th>Location</th>
                    <th class="text-center" style="width: 60px;">Stock</th>
                    <th *ngIf="tools.length > 1">Tools</th>
                    <th class="text-center" style="width: 80px;">Total</th>
                    <th style="width: 150px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <ng-container *ngFor="let item of sortedLineItems; let idx = index">
                    <!-- Location Group Header (when sorting by location) -->
                    <tr *ngIf="sortMode === 'location' && shouldShowLocationHeader(item, idx)" class="table-info">
                      <td colspan="8" class="py-2">
                        <div class="d-flex align-items-center gap-2">
                          <i class="bi bi-geo-alt-fill text-primary"></i>
                          <strong>{{ getLocationGroup(item) }}</strong>
                          <span class="badge bg-secondary">{{ getLocationGroupCount(item) }} items</span>
                          <span class="badge bg-info">{{ getLocationGroupRemaining(item) }} remaining</span>
                          <button
                            *ngIf="getLocationGroupRemaining(item) > 0"
                            class="btn btn-sm btn-success ms-auto"
                            (click)="handlePickAllInLocation(getLocationGroup(item))"
                            [disabled]="isSubmitting !== null"
                            title="Pick all remaining items in this location"
                          >
                            <i class="bi bi-check-all me-1"></i>
                            Pick All in {{ getLocationGroup(item) }}
                          </button>
                        </div>
                      </td>
                    </tr>

                    <!-- Assembly Group Header (when sorting by assembly) -->
                    <tr *ngIf="sortMode === 'assembly' && shouldShowAssemblyHeader(item, idx)" class="assembly-group-header">
                      <td colspan="8" class="py-2">
                        <div class="d-flex align-items-center gap-2">
                          <i class="bi bi-box-seam text-purple"></i>
                          <strong>{{ item.assembly_group || 'No Assembly' }}</strong>
                          <span class="badge bg-secondary">{{ getAssemblyGroupCount(item) }} parts</span>
                          <span class="badge bg-success" *ngIf="isAssemblyGroupComplete(item)">
                            <i class="bi bi-check-circle me-1"></i>Complete
                          </span>
                        </div>
                      </td>
                    </tr>

                    <!-- Main Row -->
                    <tr [class.table-success]="isItemComplete(item)"
                        [class.table-warning]="isItemPartial(item)"
                        [class.table-danger]="hasOpenIssue(item.id)"
                        [class.keyboard-selected]="keyboardSelectedIndex === idx"
                        [id]="'line-item-' + idx">
                      <!-- Expand Toggle -->
                      <td class="text-center">
                        <button class="btn btn-sm btn-link p-0" (click)="toggleExpanded(item.id)"
                                *ngIf="getPickHistoryForItem(item.id).length > 0">
                          <i class="bi" [ngClass]="expandedItems.has(item.id) ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
                        </button>
                      </td>
                      <!-- Part Number -->
                      <td>
                        <span class="font-monospace fw-medium">{{ item.part_number }}</span>
                        <span class="badge bg-danger ms-1" *ngIf="hasOpenIssue(item.id)">
                          <i class="bi bi-exclamation-triangle-fill"></i> Issue
                        </span>
                        <span class="badge bg-primary-subtle text-primary border border-primary ms-1"
                              *ngIf="item.tool_ids && item.tool_ids.length > 0 && item.tool_ids.length < tools.length">
                          {{ item.tool_ids.length }} of {{ tools.length }} tools
                        </span>
                        <span class="text-muted small d-block" *ngIf="item.assembly_group && sortMode !== 'assembly'">
                          Assy: {{ item.assembly_group }}
                        </span>
                      </td>
                      <!-- Description -->
                      <td class="text-muted small">{{ item.description || '-' }}</td>
                      <!-- Location -->
                      <td>
                        <span class="badge bg-body-secondary text-body border" *ngIf="item.location">
                          <i class="bi bi-geo-alt me-1"></i>{{ item.location }}
                        </span>
                        <span class="text-muted" *ngIf="!item.location">-</span>
                      </td>
                      <!-- Stock -->
                      <td class="text-center">
                        <span *ngIf="item.qty_available !== null && item.qty_available !== undefined"
                              [ngClass]="{
                                'text-warning fw-bold': item.qty_available < item.total_qty_needed,
                                'text-success': item.qty_available >= item.total_qty_needed
                              }">
                          {{ item.qty_available }}
                        </span>
                        <span *ngIf="item.qty_available === null || item.qty_available === undefined" class="text-muted">-</span>
                      </td>
                      <!-- Tool Checkboxes (multi-tool view) -->
                      <td *ngIf="tools.length > 1">
                        <div class="d-flex gap-1 flex-wrap align-items-center">
                          <button *ngFor="let tool of tools"
                                  class="btn btn-sm tool-checkbox"
                                  [ngClass]="getToolButtonClass(item, tool)"
                                  [title]="getToolButtonTitle(item, tool)"
                                  [disabled]="isSubmitting === item.id"
                                  (click)="handleToolClick(item, tool)">
                            <ng-container *ngIf="isToolComplete(item, tool)">
                              <i class="bi bi-check"></i>
                            </ng-container>
                            <ng-container *ngIf="isToolPartial(item, tool)">
                              {{ getToolPicked(item, tool) }}/{{ item.qty_per_unit }}
                            </ng-container>
                            <ng-container *ngIf="!isToolComplete(item, tool) && !isToolPartial(item, tool)">
                              {{ getToolLabel(tool) }}
                            </ng-container>
                          </button>
                          <span class="small text-muted ms-1">{{ item.total_picked }}/{{ item.total_qty_needed }}</span>
                        </div>
                      </td>
                      <!-- Total (single tool or summary) -->
                      <td class="text-center">
                        <span class="badge" [ngClass]="isItemComplete(item) ? 'bg-success' : (isItemPartial(item) ? 'bg-warning text-dark' : 'bg-secondary')">
                          {{ item.total_picked }}/{{ item.total_qty_needed }}
                        </span>
                      </td>
                      <!-- Actions -->
                      <td>
                        <div class="d-flex gap-1">
                          <!-- Undo Last Pick -->
                          <button class="btn btn-sm btn-outline-secondary"
                                  *ngIf="getPickHistoryForItem(item.id).length > 0"
                                  (click)="handleUndoLastPick(item)"
                                  [disabled]="isSubmitting === item.id"
                                  title="Undo last pick">
                            <i class="bi bi-arrow-counterclockwise"></i>
                          </button>
                          <!-- Pick All Remaining (for single tool orders OR pick remaining tools) -->
                          <button class="btn btn-sm btn-success"
                                  *ngIf="!isItemComplete(item)"
                                  (click)="tools.length === 1 ? handleQuickPick(item, tools[0]) : handlePickAllTools(item)"
                                  [disabled]="isSubmitting === item.id"
                                  [title]="tools.length === 1 ? 'Pick ' + getRemainingForTool(item, tools[0]) : 'Pick all remaining tools'">
                            <i class="bi bi-check-lg me-1"></i>
                            <span *ngIf="tools.length === 1">{{ getRemainingForTool(item, tools[0]) }}</span>
                            <span *ngIf="tools.length > 1">All ({{ getRemainingToolsCount(item) }})</span>
                          </button>
                          <!-- Partial Pick Button (for items with qty > 1) -->
                          <button class="btn btn-sm btn-outline-primary"
                                  *ngIf="!isItemComplete(item) && item.qty_per_unit > 1"
                                  (click)="openPartialPickModal(item)"
                                  [disabled]="isSubmitting === item.id"
                                  title="Set custom quantity">
                            <i class="bi bi-plus-slash-minus"></i>
                          </button>
                          <!-- Report Issue -->
                          <button class="btn btn-sm"
                                  [ngClass]="hasOpenIssue(item.id) ? 'btn-danger' : 'btn-outline-warning'"
                                  *ngIf="!isItemComplete(item)"
                                  (click)="openReportIssueModal(item)"
                                  [disabled]="isSubmitting === item.id"
                                  title="Report issue">
                            <i class="bi bi-exclamation-triangle"></i>
                          </button>
                          <!-- Remove Part -->
                          <button class="btn btn-sm btn-outline-danger"
                                  (click)="openDeleteLineItemModal(item)"
                                  [disabled]="isSubmitting === item.id"
                                  title="Remove part from order">
                            <i class="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>

                    <!-- Pick History Panel (expandable) -->
                    <tr *ngIf="expandedItems.has(item.id)" class="table-secondary">
                      <td colspan="8" class="p-3">
                        <div class="small">
                          <div class="d-flex align-items-center gap-2 mb-2">
                            <i class="bi bi-clock-history text-muted"></i>
                            <strong>Pick History</strong>
                            <span class="badge bg-secondary">{{ getPickHistoryForItem(item.id).length }} records</span>
                          </div>
                          <div class="list-group list-group-flush">
                            <div *ngFor="let historyItem of getPickHistoryForItem(item.id); let i = index"
                                 class="list-group-item d-flex justify-content-between align-items-center py-2"
                                 [class.border-primary]="i === 0">
                              <div class="d-flex align-items-center gap-3">
                                <span class="badge" [ngClass]="i === 0 ? 'bg-primary' : 'bg-secondary'">
                                  {{ historyItem.pick.qty_picked }}x
                                </span>
                                <span class="text-muted">
                                  <i class="bi bi-wrench me-1"></i>{{ historyItem.toolNumber }}
                                </span>
                                <span class="text-muted">
                                  <i class="bi bi-person me-1"></i>{{ historyItem.pick.picked_by || 'Unknown' }}
                                </span>
                                <span class="text-muted">
                                  {{ utils.formatDateTime(historyItem.pick.picked_at) }}
                                </span>
                                <span *ngIf="historyItem.pick.notes" class="fst-italic text-muted">
                                  "{{ historyItem.pick.notes }}"
                                </span>
                              </div>
                              <button class="btn btn-sm btn-outline-danger"
                                      (click)="handleDeletePick(historyItem.pick)"
                                      [disabled]="isSubmitting === item.id"
                                      title="Delete this pick">
                                <i class="bi bi-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="sortedLineItems.length === 0" class="text-center py-5 text-muted">
          <i class="bi bi-inbox display-4 mb-3"></i>
          <p>No line items for this order</p>
        </div>
      </div>

      <!-- Add Tool Modal -->
      <div class="modal fade" [class.show]="showAddToolModal" [style.display]="showAddToolModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Add Tool</h5>
              <button type="button" class="btn-close" (click)="showAddToolModal = false"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Tool Number</label>
                <input type="text" class="form-control" [(ngModel)]="newToolNumber"
                       [placeholder]="generateNextToolNumber()">
              </div>
              <div class="mb-3">
                <label class="form-label">Tool Model</label>
                <input type="text" class="form-control" [(ngModel)]="newToolModel"
                       [placeholder]="order?.tool_model || ''">
              </div>
              <div class="mb-3">
                <label class="form-label">Serial Number (optional)</label>
                <input type="text" class="form-control" [(ngModel)]="newToolSerial">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showAddToolModal = false">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="handleAddTool()">Add Tool</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showAddToolModal"></div>

      <!-- Manage Tools Modal -->
      <div class="modal fade" [class.show]="showManageToolsModal" [style.display]="showManageToolsModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Manage Tools</h5>
              <button type="button" class="btn-close" (click)="showManageToolsModal = false"></button>
            </div>
            <div class="modal-body">
              <div *ngIf="tools.length === 0" class="text-center text-muted py-3">
                No tools defined yet
              </div>
              <div class="list-group" *ngIf="tools.length > 0">
                <div *ngFor="let tool of tools" class="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    <strong>{{ tool.tool_number }}</strong>
                    <span *ngIf="tool.tool_model" class="badge bg-info text-dark ms-2">{{ tool.tool_model }}</span>
                    <span *ngIf="tool.serial_number" class="text-muted ms-2">SN: {{ tool.serial_number }}</span>
                    <div class="small text-muted">Progress: {{ getToolProgress(tool.id) }}%</div>
                  </div>
                  <button class="btn btn-sm btn-outline-danger" (click)="handleDeleteTool(tool)"
                          [disabled]="getToolProgress(tool.id) > 0"
                          [title]="getToolProgress(tool.id) > 0 ? 'Cannot delete tool with picks' : 'Delete tool'">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
              <hr>
              <h6>Add New Tool</h6>
              <div class="row g-2">
                <div class="col-5">
                  <input type="text" class="form-control form-control-sm" [(ngModel)]="newToolNumber"
                         placeholder="Tool Number">
                </div>
                <div class="col-3">
                  <input type="text" class="form-control form-control-sm" [(ngModel)]="newToolModel"
                         [placeholder]="order?.tool_model || 'Model'">
                </div>
                <div class="col-2">
                  <input type="text" class="form-control form-control-sm" [(ngModel)]="newToolSerial"
                         placeholder="Serial">
                </div>
                <div class="col-2">
                  <button class="btn btn-primary btn-sm w-100" (click)="handleAddTool()">
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showManageToolsModal = false">Close</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showManageToolsModal"></div>

      <!-- Add Line Item Modal -->
      <div class="modal fade" [class.show]="showAddLineItemModal" [style.display]="showAddLineItemModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Add Part</h5>
              <button type="button" class="btn-close" (click)="showAddLineItemModal = false"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Part Number *</label>
                <input type="text" class="form-control" [(ngModel)]="newLineItem.part_number">
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <input type="text" class="form-control" [(ngModel)]="newLineItem.description">
              </div>
              <div class="mb-3">
                <label class="form-label">Location</label>
                <input type="text" class="form-control" [(ngModel)]="newLineItem.location">
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Qty Per Unit</label>
                  <input type="number" class="form-control" min="1" [(ngModel)]="newLineItem.qty_per_unit">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Total Needed</label>
                  <input type="number" class="form-control" min="1" [(ngModel)]="newLineItem.total_qty_needed">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showAddLineItemModal = false">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="handleAddLineItem()"
                      [disabled]="!newLineItem.part_number.trim()">Add Part</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showAddLineItemModal"></div>

      <!-- Partial Pick Modal -->
      <div class="modal fade" [class.show]="showPartialPickModal" [style.display]="showPartialPickModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Set Pick Quantity</h5>
              <button type="button" class="btn-close" (click)="showPartialPickModal = false"></button>
            </div>
            <div class="modal-body" *ngIf="partialPickItem">
              <div class="mb-3">
                <strong>{{ partialPickItem.part_number }}</strong>
                <p class="text-muted small mb-0" *ngIf="partialPickItem.description">{{ partialPickItem.description }}</p>
              </div>
              <div class="mb-3">
                <label class="form-label">Select Tool</label>
                <select class="form-select" [(ngModel)]="partialPickToolId">
                  <option *ngFor="let tool of tools" [value]="tool.id">
                    {{ tool.tool_number }} ({{ getToolPicked(partialPickItem, tool) }}/{{ partialPickItem.qty_per_unit }} picked)
                  </option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Quantity to Pick</label>
                <div class="input-group">
                  <button class="btn btn-outline-secondary" type="button"
                          (click)="partialPickQty = Math.max(1, partialPickQty - 1)">
                    <i class="bi bi-dash"></i>
                  </button>
                  <input type="number" class="form-control text-center" [(ngModel)]="partialPickQty" min="1">
                  <button class="btn btn-outline-secondary" type="button"
                          (click)="partialPickQty = partialPickQty + 1">
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
                <small class="text-muted" *ngIf="partialPickToolId">
                  Remaining for this tool: {{ getRemainingForToolById(partialPickItem, partialPickToolId) }}
                </small>
              </div>
              <div class="mb-3">
                <label class="form-label">Note (optional)</label>
                <textarea class="form-control" rows="2" [(ngModel)]="partialPickNote"
                          placeholder="Why is this a partial pick?"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showPartialPickModal = false">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="handlePartialPick()"
                      [disabled]="!partialPickToolId || partialPickQty < 1">
                Pick {{ partialPickQty }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showPartialPickModal"></div>

      <!-- Undo Tool Pick Confirmation Modal -->
      <div class="modal fade" [class.show]="showUndoToolModal" [style.display]="showUndoToolModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Undo Pick for {{ undoToolData?.toolNumber }}?</h5>
              <button type="button" class="btn-close" (click)="showUndoToolModal = false"></button>
            </div>
            <div class="modal-body" *ngIf="undoToolData">
              <p>This will remove all picks for this part on the selected tool.</p>
              <div class="alert alert-warning">
                <strong>{{ undoToolData.item.part_number }}</strong>
                <br>
                <span class="text-muted">{{ undoToolData.pickedQty }}x will be removed from {{ undoToolData.toolNumber }}</span>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showUndoToolModal = false">Cancel</button>
              <button type="button" class="btn btn-danger" (click)="confirmUndoToolPick()">
                <i class="bi bi-arrow-counterclockwise me-1"></i> Undo Pick
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showUndoToolModal"></div>

      <!-- Report Issue Modal -->
      <div class="modal fade" [class.show]="showReportIssueModal" [style.display]="showReportIssueModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Report Issue</h5>
              <button type="button" class="btn-close" (click)="showReportIssueModal = false"></button>
            </div>
            <div class="modal-body" *ngIf="issueReportItem">
              <div class="mb-3">
                <strong>{{ issueReportItem.part_number }}</strong>
                <p class="text-muted small mb-0" *ngIf="issueReportItem.description">{{ issueReportItem.description }}</p>
              </div>
              <div class="mb-3">
                <label class="form-label">Issue Type</label>
                <select class="form-select" [(ngModel)]="issueType">
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="damaged">Damaged</option>
                  <option value="wrong_part">Wrong Part</option>
                  <option value="missing">Missing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Description (optional)</label>
                <textarea class="form-control" rows="3" [(ngModel)]="issueDescription"
                          placeholder="Describe the issue..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showReportIssueModal = false">Cancel</button>
              <button type="button" class="btn btn-danger" (click)="handleReportIssue()">
                <i class="bi bi-exclamation-triangle me-1"></i> Report Issue
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showReportIssueModal"></div>

      <!-- Delete Line Item Confirmation Modal -->
      <div class="modal fade" [class.show]="showDeleteLineItemModal" [style.display]="showDeleteLineItemModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Remove Part from Order</h5>
              <button type="button" class="btn-close" (click)="showDeleteLineItemModal = false"></button>
            </div>
            <div class="modal-body" *ngIf="deleteLineItemTarget">
              <p>Are you sure you want to remove <strong>{{ deleteLineItemTarget.part_number }}</strong> from this order? This cannot be undone.</p>
              <div class="alert alert-warning" *ngIf="deleteLineItemTarget.total_picked > 0">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                This part has existing picks ({{ deleteLineItemTarget.total_picked }} picked). You must undo all picks before removing.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showDeleteLineItemModal = false">Cancel</button>
              <button type="button" class="btn btn-danger" (click)="handleDeleteLineItem()"
                      [disabled]="deleteLineItemTarget && deleteLineItemTarget.total_picked > 0">
                <i class="bi bi-trash me-1"></i> Remove
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showDeleteLineItemModal"></div>

      <!-- Save as Template Dialog -->
      <app-save-as-template-dialog
        [(show)]="showSaveTemplateModal"
        [lineItemsCount]="lineItems.length"
        [defaultToolModel]="order?.tool_model || null"
        (saveTemplate)="handleSaveAsTemplate($event)"
      ></app-save-as-template-dialog>

      <!-- Print Pick List Dialog -->
      <app-print-pick-list
        [show]="showPrintModal"
        [order]="order"
        [tools]="tools"
        [lineItems]="lineItemsWithPicks"
      ></app-print-pick-list>
      <div class="modal-backdrop fade show" *ngIf="showPrintModal" (click)="showPrintModal = false"></div>

      <!-- Distribute Inventory Dialog -->
      <app-distribute-inventory-dialog
        [(show)]="showDistributeModal"
        [lineItem]="distributeItem"
        [tools]="tools"
        [getToolPicked]="getToolPickedBound"
        (distribute)="handleDistribute($event)"
      ></app-distribute-inventory-dialog>

      <!-- Print Tag Dialog -->
      <app-print-tag-dialog
        [isOpen]="showPrintTagDialog"
        [tagData]="printTagData"
        (close)="closePrintTagDialog()"
      ></app-print-tag-dialog>
    </div>
  `,
  styles: [`
    .cursor-pointer { cursor: pointer; }
    .font-monospace { font-family: monospace; }

    .tool-checkbox {
      width: 32px;
      height: 32px;
      padding: 0;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tool-checkbox.btn-success {
      background-color: #198754;
      border-color: #198754;
      color: white;
    }

    .tool-checkbox.btn-success:hover {
      background-color: #dc3545;
      border-color: #dc3545;
    }

    .tool-checkbox.btn-warning {
      background-color: #ffc107;
      border-color: #ffc107;
      color: #000;
      font-size: 0.6rem;
    }

    .tool-checkbox.btn-light {
      background-color: var(--bs-secondary-bg);
      border-color: var(--bs-border-color);
      color: var(--bs-body-color);
    }

    .tool-checkbox.btn-light:hover {
      background-color: #0d6efd;
      border-color: #0d6efd;
      color: white;
    }

    .tool-checkbox.ring {
      box-shadow: 0 0 0 2px #0d6efd;
    }

    .modal.show { display: block !important; }

    .table-success { background-color: rgba(25, 135, 84, 0.1) !important; }
    .table-warning { background-color: rgba(255, 193, 7, 0.1) !important; }
    .table-danger { background-color: rgba(220, 53, 69, 0.1) !important; }
    .table-info { background-color: rgba(13, 202, 240, 0.15) !important; }

    :host-context([data-bs-theme="dark"]) .table-success { background-color: rgba(25, 135, 84, 0.2) !important; }
    :host-context([data-bs-theme="dark"]) .table-warning { background-color: rgba(255, 193, 7, 0.15) !important; }
    :host-context([data-bs-theme="dark"]) .table-danger { background-color: rgba(220, 53, 69, 0.15) !important; }
    :host-context([data-bs-theme="dark"]) .table-info { background-color: rgba(13, 202, 240, 0.1) !important; }

    .assembly-group-header td {
      background-color: rgba(111, 66, 193, 0.08) !important;
      border-left: 3px solid #6f42c1;
    }

    :host-context([data-bs-theme="dark"]) .assembly-group-header td {
      background-color: rgba(111, 66, 193, 0.15) !important;
    }

    .text-purple {
      color: #6f42c1;
    }

    .keyboard-selected {
      outline: 2px solid #0d6efd !important;
      outline-offset: -2px;
    }

    .keyboard-selected td {
      background-color: rgba(13, 110, 253, 0.08) !important;
    }

    :host-context([data-bs-theme="dark"]) .keyboard-selected td {
      background-color: rgba(13, 110, 253, 0.15) !important;
    }
  `]
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  // Expose Math for template use
  Math = Math;

  order: Order | null = null;
  tools: Tool[] = [];
  lineItems: LineItem[] = [];
  lineItemsWithPicks: LineItemWithPicks[] = [];
  picks: Pick[] = [];
  openIssues: Set<string> = new Set();

  loading = true;
  isEditing = false;
  isOrderInfoExpanded = false;
  showAddToolModal = false;
  showManageToolsModal = false;
  showAddLineItemModal = false;
  showPartialPickModal = false;
  showUndoToolModal = false;
  showReportIssueModal = false;
  showSaveTemplateModal = false;
  showPrintModal = false;
  showDistributeModal = false;
  showDeleteLineItemModal = false;

  sortMode: SortMode = 'part_number';
  hideCompleted = false;
  showOutOfStockOnly = false;
  toolFilter: string | null = null;
  expandedItems: Set<string> = new Set();
  isSubmitting: string | null = null;
  partSearchQuery: string = '';
  keyboardSelectedIndex = -1;
  distributeItem: LineItemWithPicks | null = null;
  deleteLineItemTarget: LineItemWithPicks | null = null;
  overPickWarning: string | null = null;
  scrollToItemId: string | null = null;

  // Tag printing
  showPrintTagDialog = false;
  printTagData: TagData | TagData[] | null = null;

  editForm = {
    so_number: '',
    po_number: '',
    customer_name: '',
    tool_model: '',
    order_date: '',
    due_date: '',
    notes: '',
  };

  newToolNumber = '';
  newToolModel = '';
  newToolSerial = '';

  newLineItem = {
    part_number: '',
    description: '',
    location: '',
    qty_per_unit: 1,
    total_qty_needed: 1,
  };

  // Partial pick modal state
  partialPickItem: LineItemWithPicks | null = null;
  partialPickToolId: string = '';
  partialPickQty: number = 1;
  partialPickNote: string = '';

  // Undo tool modal state
  undoToolData: { item: LineItemWithPicks; toolId: string; toolNumber: string; pickedQty: number } | null = null;

  // Report issue modal state
  issueReportItem: LineItemWithPicks | null = null;
  issueType: IssueType = 'out_of_stock';
  issueDescription: string = '';

  private orderId: string | null = null;
  private subscriptions: Subscription[] = [];
  private allToolsPicksMap: Map<string, Map<string, number>> = new Map();

  constructor(
    private route: ActivatedRoute,
    private ordersService: OrdersService,
    private picksService: PicksService,
    private lineItemsService: LineItemsService,
    private issuesService: IssuesService,
    private settingsService: SettingsService,
    private excelService: ExcelService,
    private bomTemplatesService: BomTemplatesService,
    private activityLogService: ActivityLogService,
    public utils: UtilsService
  ) {
    // Bind getToolPicked for child component
    this.getToolPickedBound = this.getToolPicked.bind(this);
  }

  // Bound function for child component
  getToolPickedBound: (item: LineItemWithPicks, tool: Tool) => number;

  // Keyboard navigation
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    // Ignore if any modal is open
    if (this.showPartialPickModal || this.showUndoToolModal || this.showReportIssueModal ||
        this.showSaveTemplateModal || this.showPrintModal || this.showDistributeModal ||
        this.showAddToolModal || this.showManageToolsModal || this.showAddLineItemModal ||
        this.showDeleteLineItemModal) {
      return;
    }

    const items = this.sortedLineItems;
    if (items.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        event.preventDefault();
        if (this.keyboardSelectedIndex < items.length - 1) {
          this.keyboardSelectedIndex++;
          this.scrollToSelectedItem();
        }
        break;

      case 'ArrowUp':
      case 'k':
        event.preventDefault();
        if (this.keyboardSelectedIndex > 0) {
          this.keyboardSelectedIndex--;
          this.scrollToSelectedItem();
        } else if (this.keyboardSelectedIndex === -1 && items.length > 0) {
          this.keyboardSelectedIndex = 0;
          this.scrollToSelectedItem();
        }
        break;

      case 'Enter':
      case ' ':
        if (this.keyboardSelectedIndex >= 0 && this.keyboardSelectedIndex < items.length) {
          event.preventDefault();
          const item = items[this.keyboardSelectedIndex];
          if (!this.isItemComplete(item)) {
            if (this.tools.length === 1) {
              this.handleQuickPick(item, this.tools[0]);
            } else {
              this.handlePickAllTools(item);
            }
          }
        }
        break;

      case 'Escape':
        this.keyboardSelectedIndex = -1;
        break;

      case 'Home':
        event.preventDefault();
        if (items.length > 0) {
          this.keyboardSelectedIndex = 0;
          this.scrollToSelectedItem();
        }
        break;

      case 'End':
        event.preventDefault();
        if (items.length > 0) {
          this.keyboardSelectedIndex = items.length - 1;
          this.scrollToSelectedItem();
        }
        break;
    }
  }

  private scrollToSelectedItem(): void {
    setTimeout(() => {
      const element = document.getElementById(`line-item-${this.keyboardSelectedIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  private scrollToLineItemById(): void {
    if (!this.scrollToItemId) return;

    // Find the index of the item in sortedLineItems
    const items = this.sortedLineItems;
    const index = items.findIndex(item => item.id === this.scrollToItemId);

    if (index >= 0) {
      setTimeout(() => {
        const element = document.getElementById(`line-item-${index}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Clear the scroll target after scrolling
        this.scrollToItemId = null;
      }, 100); // Small delay to allow DOM to update
    } else {
      // Item not found (may be hidden by filter), clear the target gracefully
      this.scrollToItemId = null;
    }
  }

  ngOnInit(): void {
    // Load sort preference from localStorage
    const savedSort = localStorage.getItem('picking-sort-preference');
    if (savedSort === 'location' || savedSort === 'part_number' || savedSort === 'assembly') {
      this.sortMode = savedSort;
    }

    // Load hide completed preference
    const savedHideCompleted = localStorage.getItem('picking-hide-completed');
    if (savedHideCompleted === 'true') {
      this.hideCompleted = true;
    }

    // Load out of stock filter preference
    const savedShowOutOfStock = localStorage.getItem('picking-show-out-of-stock');
    if (savedShowOutOfStock === 'true') {
      this.showOutOfStockOnly = true;
    }

    this.route.params.subscribe(params => {
      this.orderId = params['id'];
      if (this.orderId) {
        this.loadOrder();
        this.picksService.loadPicksForOrder(this.orderId);
        this.issuesService.loadIssuesForOrder(this.orderId);
      }
    });

    this.subscriptions.push(
      this.picksService.lineItemsWithPicks$.subscribe(items => {
        this.lineItemsWithPicks = items;
        this.updateAllToolsPicksMap();
        // Scroll to tracked item after data refresh
        if (this.scrollToItemId) {
          this.scrollToLineItemById();
        }
      }),
      this.picksService.picks$.subscribe(picks => {
        this.picks = picks;
        this.updateAllToolsPicksMap();
      }),
      this.issuesService.issues$.subscribe(issues => {
        this.openIssues = new Set(
          issues.filter(i => i.status === 'open').map(i => i.line_item_id)
        );
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private updateAllToolsPicksMap(): void {
    this.allToolsPicksMap = this.picksService.getPicksForAllTools();
  }

  async loadOrder(): Promise<void> {
    if (!this.orderId) return;

    this.loading = true;
    const result = await this.ordersService.getOrder(this.orderId);
    this.order = result.order;
    this.tools = result.tools;
    this.lineItems = result.lineItems;
    this.loading = false;
  }

  // Persist sort preference
  get sortModeValue(): SortMode {
    return this.sortMode;
  }

  set sortModeValue(value: SortMode) {
    this.sortMode = value;
    localStorage.setItem('picking-sort-preference', value);
  }

  get sortedLineItems(): LineItemWithPicks[] {
    let items = [...this.lineItemsWithPicks];

    // Filter by search query
    if (this.partSearchQuery.trim()) {
      const query = this.partSearchQuery.toLowerCase();
      items = items.filter(item =>
        item.part_number.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query)) ||
        (item.location?.toLowerCase().includes(query))
      );
    }

    // Filter by tool
    if (this.toolFilter) {
      items = items.filter(item =>
        !item.tool_ids || item.tool_ids.length === 0 || item.tool_ids.includes(this.toolFilter!)
      );
    }

    // Hide completed items
    if (this.hideCompleted) {
      items = items.filter(item => !this.isItemComplete(item));
    }

    // Filter to show only out of stock items
    if (this.showOutOfStockOnly) {
      items = items.filter(item => item.qty_available === 0);
    }

    // Sort
    if (this.sortMode === 'location') {
      items.sort((a, b) => {
        const locA = a.location || '';
        const locB = b.location || '';
        if (!locA && locB) return 1;
        if (locA && !locB) return -1;
        if (!locA && !locB) return this.alphanumericCompare(a.part_number, b.part_number);
        const cmp = this.alphanumericCompare(locA, locB);
        return cmp !== 0 ? cmp : this.alphanumericCompare(a.part_number, b.part_number);
      });
    } else if (this.sortMode === 'assembly') {
      items.sort((a, b) => {
        const groupA = a.assembly_group || '';
        const groupB = b.assembly_group || '';
        if (!groupA && groupB) return 1;
        if (groupA && !groupB) return -1;
        if (!groupA && !groupB) return this.alphanumericCompare(a.part_number, b.part_number);
        const cmp = this.alphanumericCompare(groupA, groupB);
        return cmp !== 0 ? cmp : this.alphanumericCompare(a.part_number, b.part_number);
      });
    } else {
      items.sort((a, b) => this.alphanumericCompare(a.part_number, b.part_number));
    }

    return items;
  }

  private alphanumericCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  private getLocationPrefix(location: string | null | undefined): string {
    if (!location) return 'No Location';
    const parts = location.split('-');
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return parts[0] || 'No Location';
  }

  shouldShowLocationHeader(item: LineItemWithPicks, index: number): boolean {
    if (this.sortMode !== 'location') return false;
    if (index === 0) return true;

    const sorted = this.sortedLineItems;
    const prevItem = sorted[index - 1];
    return this.getLocationPrefix(item.location) !== this.getLocationPrefix(prevItem.location);
  }

  getLocationGroup(item: LineItemWithPicks): string {
    return this.getLocationPrefix(item.location);
  }

  getLocationGroupCount(item: LineItemWithPicks): number {
    const prefix = this.getLocationPrefix(item.location);
    return this.sortedLineItems.filter(i => this.getLocationPrefix(i.location) === prefix).length;
  }

  getLocationGroupRemaining(item: LineItemWithPicks): number {
    const prefix = this.getLocationPrefix(item.location);
    return this.sortedLineItems
      .filter(i => this.getLocationPrefix(i.location) === prefix)
      .reduce((sum, i) => sum + i.remaining, 0);
  }

  // Assembly group helpers
  shouldShowAssemblyHeader(item: LineItemWithPicks, index: number): boolean {
    if (this.sortMode !== 'assembly') return false;
    if (index === 0) return true;
    const sorted = this.sortedLineItems;
    const prevItem = sorted[index - 1];
    return (item.assembly_group || '') !== (prevItem.assembly_group || '');
  }

  getAssemblyGroupCount(item: LineItemWithPicks): number {
    const group = item.assembly_group || '';
    return this.sortedLineItems.filter(i => (i.assembly_group || '') === group).length;
  }

  isAssemblyGroupComplete(item: LineItemWithPicks): boolean {
    const group = item.assembly_group || '';
    return this.sortedLineItems
      .filter(i => (i.assembly_group || '') === group)
      .every(i => this.isItemComplete(i));
  }

  // Sort mode with localStorage persistence
  setSortMode(mode: SortMode): void {
    this.sortMode = mode;
    localStorage.setItem('picking-sort-preference', mode);
  }

  // Hide completed toggle with localStorage persistence
  toggleHideCompleted(): void {
    this.hideCompleted = !this.hideCompleted;
    localStorage.setItem('picking-hide-completed', String(this.hideCompleted));
  }

  // Out of stock filter toggle with localStorage persistence
  toggleShowOutOfStockOnly(): void {
    this.showOutOfStockOnly = !this.showOutOfStockOnly;
    localStorage.setItem('picking-show-out-of-stock', String(this.showOutOfStockOnly));
  }

  // Get count of items with zero stock
  get outOfStockCount(): number {
    return this.lineItemsWithPicks.filter(item => item.qty_available === 0).length;
  }

  // Get tool number by ID for the filter dropdown display
  getToolNumberById(toolId: string): string {
    return this.tools.find(t => t.id === toolId)?.tool_number || toolId;
  }

  // Get tooltip text for tool badge
  getToolTooltip(tool: Tool): string {
    const parts = [tool.tool_number];
    if (tool.tool_model) parts.push(`Model: ${tool.tool_model}`);
    if (tool.serial_number) parts.push(`SN: ${tool.serial_number}`);
    parts.push(`Progress: ${this.getToolProgress(tool.id)}%`);
    return parts.join(' | ');
  }

  // Get label for tool filter button (tool number + model)
  getToolFilterLabel(toolId: string): string {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) return toolId;
    if (tool.tool_model) return `${tool.tool_number} [${tool.tool_model}]`;
    return tool.tool_number;
  }

  async handlePickAllInLocation(locationGroup: string): Promise<void> {
    const itemsInLocation = this.sortedLineItems.filter(
      i => this.getLocationPrefix(i.location) === locationGroup && i.remaining > 0
    );

    if (itemsInLocation.length === 0) return;

    this.isSubmitting = 'batch';
    const userName = this.settingsService.getUserName();
    let hasWarnings = false;

    for (const item of itemsInLocation) {
      for (const tool of this.tools) {
        const remaining = this.getRemainingForTool(item, tool);
        if (remaining > 0) {
          const result = await this.picksService.recordPick(item.id, tool.id, remaining, userName);
          if (result && 'overPickWarning' in result && result.overPickWarning) {
            hasWarnings = true;
          }
        }
      }
    }

    if (hasWarnings) {
      this.overPickWarning = 'Some items may have been over-picked. Another user may have picked items at the same time. Please review the quantities.';
      setTimeout(() => this.overPickWarning = null, 8000);
    }

    this.isSubmitting = null;
  }

  get totalLineItems(): number {
    return this.lineItemsWithPicks.length;
  }

  get completedLineItems(): number {
    return this.lineItemsWithPicks.filter(
      item => item.total_picked >= item.total_qty_needed
    ).length;
  }

  get progressPercent(): number {
    return this.totalLineItems > 0 ? Math.round((this.completedLineItems / this.totalLineItems) * 100) : 0;
  }

  get isFullyPicked(): boolean {
    return this.progressPercent === 100 && this.totalLineItems > 0;
  }

  // Tool-related helpers
  getToolProgress(toolId: string): number {
    const toolPicks = this.picksService.getPicksForTool(toolId);
    // Only count items applicable to this tool (respects tool_ids)
    const applicableItems = this.lineItems.filter(item =>
      !item.tool_ids || item.tool_ids.length === 0 || item.tool_ids.includes(toolId)
    );
    const toolTotalItems = applicableItems.length;
    const toolCompletedItems = applicableItems.filter(item => {
      const picked = toolPicks.get(item.id) || 0;
      return picked >= item.qty_per_unit;
    }).length;
    return toolTotalItems > 0 ? Math.round((toolCompletedItems / toolTotalItems) * 100) : 0;
  }

  getToolLabel(tool: Tool): string {
    if (tool.tool_number.includes('-')) {
      return tool.tool_number.split('-').pop() || tool.tool_number.slice(-2);
    }
    return tool.tool_number.slice(-2);
  }

  getToolPicked(item: LineItemWithPicks, tool: Tool): number {
    const toolPicks = this.allToolsPicksMap.get(tool.id);
    return toolPicks?.get(item.id) || 0;
  }

  getRemainingForTool(item: LineItemWithPicks, tool: Tool): number {
    return item.qty_per_unit - this.getToolPicked(item, tool);
  }

  getRemainingForToolById(item: LineItemWithPicks, toolId: string): number {
    const tool = this.tools.find(t => t.id === toolId);
    return tool ? this.getRemainingForTool(item, tool) : 0;
  }

  isToolComplete(item: LineItemWithPicks, tool: Tool): boolean {
    return this.getToolPicked(item, tool) >= item.qty_per_unit;
  }

  isToolPartial(item: LineItemWithPicks, tool: Tool): boolean {
    const picked = this.getToolPicked(item, tool);
    return picked > 0 && picked < item.qty_per_unit;
  }

  isItemComplete(item: LineItemWithPicks): boolean {
    return item.remaining === 0;
  }

  isItemPartial(item: LineItemWithPicks): boolean {
    return item.total_picked > 0 && item.remaining > 0;
  }

  getRemainingToolsCount(item: LineItemWithPicks): number {
    return this.tools.filter(t => !this.isToolComplete(item, t)).length;
  }

  hasOpenIssue(lineItemId: string): boolean {
    return this.openIssues.has(lineItemId);
  }

  getToolButtonClass(item: LineItemWithPicks, tool: Tool): string {
    if (this.isToolComplete(item, tool)) return 'btn-success';
    if (this.isToolPartial(item, tool)) return 'btn-warning';
    return 'btn-light';
  }

  getToolButtonTitle(item: LineItemWithPicks, tool: Tool): string {
    const picked = this.getToolPicked(item, tool);
    const needed = item.qty_per_unit;
    if (this.isToolComplete(item, tool)) {
      return `${tool.tool_number}: Complete - Click to undo`;
    }
    if (this.isToolPartial(item, tool)) {
      return `${tool.tool_number}: Partial (${picked}/${needed}) - Click for options`;
    }
    return `${tool.tool_number}: Click to pick ${needed}`;
  }

  // Pick History
  getPickHistoryForItem(lineItemId: string): PickHistoryItem[] {
    const itemPicks = this.picks.filter(p => p.line_item_id === lineItemId);
    // Sort by picked_at descending (most recent first)
    itemPicks.sort((a, b) => new Date(b.picked_at).getTime() - new Date(a.picked_at).getTime());

    return itemPicks.map(pick => {
      const tool = this.tools.find(t => t.id === pick.tool_id);
      return {
        pick,
        toolNumber: tool?.tool_number || 'Unknown'
      };
    });
  }

  toggleExpanded(itemId: string): void {
    if (this.expandedItems.has(itemId)) {
      this.expandedItems.delete(itemId);
    } else {
      this.expandedItems.add(itemId);
    }
  }

  // Actions
  async handleToolClick(item: LineItemWithPicks, tool: Tool): Promise<void> {
    const picked = this.getToolPicked(item, tool);
    const needed = item.qty_per_unit;

    if (this.isToolComplete(item, tool)) {
      // Show undo confirmation
      this.undoToolData = {
        item,
        toolId: tool.id,
        toolNumber: tool.tool_number,
        pickedQty: picked
      };
      this.showUndoToolModal = true;
    } else if (this.isToolPartial(item, tool)) {
      // Open partial pick modal for this tool
      this.openPartialPickModal(item, tool.id);
    } else {
      // Pick all for this tool
      await this.handlePickForTool(item, tool);
    }
  }

  async handlePickForTool(item: LineItemWithPicks, tool: Tool): Promise<void> {
    const remaining = this.getRemainingForTool(item, tool);
    if (remaining <= 0) return;

    this.isSubmitting = item.id;
    this.scrollToItemId = item.id;  // Track for scroll after refresh
    const userName = this.settingsService.getUserName();
    const result = await this.picksService.recordPick(item.id, tool.id, remaining, userName);

    // Check for over-pick warning (concurrent pick detection)
    if (result && 'overPickWarning' in result && result.overPickWarning) {
      this.overPickWarning = result.overPickWarning;
      // Auto-dismiss after 8 seconds
      setTimeout(() => this.overPickWarning = null, 8000);
    }

    // Trigger tag printing dialog if enabled and pick was successful
    if (result && this.settingsService.isTagPrintingEnabled() && this.order) {
      this.printTagData = {
        partNumber: item.part_number,
        description: item.description,
        location: item.location,
        soNumber: this.order.so_number,
        toolNumber: tool.tool_number,
        qtyPicked: remaining,
        pickedBy: userName,
        pickedAt: new Date(),
      };
      this.showPrintTagDialog = true;
    }

    this.isSubmitting = null;
  }

  async handleQuickPick(item: LineItemWithPicks, tool: Tool): Promise<void> {
    await this.handlePickForTool(item, tool);
  }

  async handlePickAllTools(item: LineItemWithPicks): Promise<void> {
    this.isSubmitting = item.id;
    this.scrollToItemId = item.id;  // Track for scroll after refresh
    const userName = this.settingsService.getUserName();
    let hasWarnings = false;

    for (const tool of this.tools) {
      const remaining = this.getRemainingForTool(item, tool);
      if (remaining > 0) {
        const result = await this.picksService.recordPick(item.id, tool.id, remaining, userName);
        if (result && 'overPickWarning' in result && result.overPickWarning) {
          hasWarnings = true;
        }
      }
    }

    if (hasWarnings) {
      this.overPickWarning = 'Some items may have been over-picked. Another user may have picked items at the same time. Please review the quantities.';
      setTimeout(() => this.overPickWarning = null, 8000);
    }

    this.isSubmitting = null;
  }

  async handleUndoLastPick(item: LineItemWithPicks): Promise<void> {
    const history = this.getPickHistoryForItem(item.id);
    if (history.length === 0) return;

    this.isSubmitting = item.id;
    await this.picksService.undoPick(history[0].pick.id, this.settingsService.getUserName());
    this.isSubmitting = null;
  }

  async handleDeletePick(pick: Pick): Promise<void> {
    this.isSubmitting = pick.line_item_id;
    await this.picksService.undoPick(pick.id, this.settingsService.getUserName());
    this.isSubmitting = null;
  }

  async confirmUndoToolPick(): Promise<void> {
    if (!this.undoToolData) return;

    this.isSubmitting = this.undoToolData.item.id;

    // Get all picks for this line item and tool
    const toolPicks = this.picks.filter(
      p => p.line_item_id === this.undoToolData!.item.id && p.tool_id === this.undoToolData!.toolId
    );

    // Delete all picks
    const userName = this.settingsService.getUserName();
    for (const pick of toolPicks) {
      await this.picksService.undoPick(pick.id, userName);
    }

    this.isSubmitting = null;
    this.showUndoToolModal = false;
    this.undoToolData = null;
  }

  // Partial Pick Modal
  openPartialPickModal(item: LineItemWithPicks, toolId?: string): void {
    this.partialPickItem = item;
    this.partialPickToolId = toolId || (this.tools.length > 0 ? this.tools[0].id : '');
    this.partialPickQty = 1;
    this.partialPickNote = '';
    this.showPartialPickModal = true;
  }

  async handlePartialPick(): Promise<void> {
    if (!this.partialPickItem || !this.partialPickToolId || this.partialPickQty < 1) return;

    const remaining = this.getRemainingForToolById(this.partialPickItem, this.partialPickToolId);
    const qtyToPick = Math.min(this.partialPickQty, remaining);

    if (qtyToPick <= 0) return;

    this.isSubmitting = this.partialPickItem.id;
    this.scrollToItemId = this.partialPickItem.id;  // Track for scroll after refresh
    const userName = this.settingsService.getUserName();
    const result = await this.picksService.recordPick(
      this.partialPickItem.id,
      this.partialPickToolId,
      qtyToPick,
      userName,
      this.partialPickNote || undefined
    );

    if (result && 'overPickWarning' in result && result.overPickWarning) {
      this.overPickWarning = result.overPickWarning;
      setTimeout(() => this.overPickWarning = null, 8000);
    }

    this.isSubmitting = null;
    this.showPartialPickModal = false;
    this.partialPickItem = null;
  }

  // Report Issue Modal
  openReportIssueModal(item: LineItemWithPicks): void {
    this.issueReportItem = item;
    this.issueType = 'out_of_stock';
    this.issueDescription = '';
    this.showReportIssueModal = true;
  }

  async handleReportIssue(): Promise<void> {
    if (!this.issueReportItem || !this.orderId) return;

    const userName = this.settingsService.getUserName();
    await this.issuesService.reportIssue(
      this.issueReportItem.id,
      this.orderId,
      this.issueType,
      this.issueDescription || undefined,
      userName
    );

    this.showReportIssueModal = false;
    this.issueReportItem = null;
  }

  // Other helpers
  generateNextToolNumber(): string {
    if (!this.order) return '';
    return this.ordersService.generateNextToolNumber(this.order.so_number, this.tools);
  }

  getOrderSummary(): string {
    if (!this.order) return 'No details';
    const parts = [
      this.order.customer_name,
      this.order.po_number ? 'PO: ' + this.order.po_number : null,
      this.order.tool_model,
      this.order.due_date ? 'Due: ' + this.utils.formatDate(this.order.due_date) : null
    ].filter(x => x != null);
    return parts.length > 0 ? parts.join(' • ') : 'No details';
  }

  async handleStatusChange(): Promise<void> {
    if (!this.order) return;
    await this.ordersService.updateOrder(this.order.id, { status: this.order.status });
  }

  async handleMarkComplete(): Promise<void> {
    if (!this.order) return;
    await this.ordersService.updateOrder(this.order.id, { status: 'complete' });
    await this.loadOrder();
  }

  startEditing(): void {
    if (!this.order) return;
    this.editForm = {
      so_number: this.order.so_number || '',
      po_number: this.order.po_number || '',
      customer_name: this.order.customer_name || '',
      tool_model: this.order.tool_model || '',
      order_date: this.order.order_date || '',
      due_date: this.order.due_date || '',
      notes: this.order.notes || '',
    };
    this.isEditing = true;
    this.isOrderInfoExpanded = true;
  }

  cancelEditing(): void {
    this.isEditing = false;
  }

  async saveChanges(): Promise<void> {
    if (!this.order) return;
    await this.ordersService.updateOrder(this.order.id, {
      so_number: this.editForm.so_number || this.order.so_number,
      po_number: this.editForm.po_number || null,
      customer_name: this.editForm.customer_name || null,
      tool_model: this.editForm.tool_model || null,
      order_date: this.editForm.order_date || null,
      due_date: this.editForm.due_date || null,
      notes: this.editForm.notes || null,
    });
    this.isEditing = false;
    await this.loadOrder();
  }

  handleExport(): void {
    if (!this.order) return;
    this.excelService.exportOrderToExcel(this.order, this.tools, this.lineItemsWithPicks, this.picks);
  }

  async handleAddTool(): Promise<void> {
    if (!this.orderId) return;
    const toolNumber = this.newToolNumber.trim() || this.generateNextToolNumber();
    const toolModel = this.newToolModel.trim() || this.order?.tool_model || undefined;
    await this.ordersService.addTool(this.orderId, toolNumber, this.newToolSerial || undefined, toolModel);
    this.newToolNumber = '';
    this.newToolModel = '';
    this.newToolSerial = '';
    this.showAddToolModal = false;
    await this.loadOrder();
  }

  async handleDeleteTool(tool: Tool): Promise<void> {
    if (!this.orderId) return;
    // Only allow deletion if no picks for this tool
    if (this.getToolProgress(tool.id) > 0) return;
    await this.ordersService.deleteTool(tool.id);
    await this.loadOrder();
  }

  async handleAddLineItem(): Promise<void> {
    if (!this.orderId || !this.newLineItem.part_number.trim() || !this.order) return;

    const partNumber = this.newLineItem.part_number.trim();
    const result = await this.lineItemsService.addLineItem(this.orderId, {
      part_number: partNumber,
      description: this.newLineItem.description.trim() || undefined,
      location: this.newLineItem.location.trim() || undefined,
      qty_per_unit: this.newLineItem.qty_per_unit,
      total_qty_needed: this.newLineItem.total_qty_needed,
    });

    if (result) {
      await this.activityLogService.logActivity({
        type: 'part_added',
        order_id: this.order.id,
        so_number: this.order.so_number,
        part_number: partNumber,
        description: `Part ${partNumber} added to SO-${this.order.so_number}`,
        performed_by: this.settingsService.getUserName(),
        details: {
          qty_per_unit: this.newLineItem.qty_per_unit,
          total_qty_needed: this.newLineItem.total_qty_needed,
          location: this.newLineItem.location.trim() || null,
        },
      });
    }

    this.newLineItem = {
      part_number: '',
      description: '',
      location: '',
      qty_per_unit: 1,
      total_qty_needed: 1,
    };
    this.showAddLineItemModal = false;
    await this.loadOrder();
    if (this.orderId) {
      this.picksService.loadPicksForOrder(this.orderId);
    }
  }

  // Delete Line Item
  openDeleteLineItemModal(item: LineItemWithPicks): void {
    this.deleteLineItemTarget = item;
    this.showDeleteLineItemModal = true;
  }

  async handleDeleteLineItem(): Promise<void> {
    if (!this.deleteLineItemTarget || !this.orderId || !this.order) return;
    if (this.deleteLineItemTarget.total_picked > 0) return;

    const partNumber = this.deleteLineItemTarget.part_number;
    const lineItemId = this.deleteLineItemTarget.id;
    const details = {
      qty_per_unit: this.deleteLineItemTarget.qty_per_unit,
      total_qty_needed: this.deleteLineItemTarget.total_qty_needed,
      location: this.deleteLineItemTarget.location || null,
      description: this.deleteLineItemTarget.description || null,
    };

    const success = await this.lineItemsService.deleteLineItem(lineItemId);
    if (success) {
      await this.activityLogService.logActivity({
        type: 'part_removed',
        order_id: this.order.id,
        so_number: this.order.so_number,
        part_number: partNumber,
        description: `Part ${partNumber} removed from SO-${this.order.so_number}`,
        performed_by: this.settingsService.getUserName(),
        details,
      });
      await this.loadOrder();
      if (this.orderId) {
        this.picksService.loadPicksForOrder(this.orderId);
      }
    }

    this.showDeleteLineItemModal = false;
    this.deleteLineItemTarget = null;
  }

  // Save as Template
  async handleSaveAsTemplate(data: { name: string; toolModel: string | null }): Promise<void> {
    if (this.lineItems.length === 0) return;

    await this.bomTemplatesService.createTemplateFromOrder(
      data.name,
      data.toolModel,
      this.lineItems
    );
  }

  // Distribute Inventory
  openDistributeDialog(item: LineItemWithPicks): void {
    this.distributeItem = item;
    this.showDistributeModal = true;
  }

  async handleDistribute(allocations: { toolId: string; qty: number }[]): Promise<void> {
    if (!this.distributeItem) return;

    this.isSubmitting = this.distributeItem.id;
    this.scrollToItemId = this.distributeItem.id;  // Track for scroll after refresh
    const userName = this.settingsService.getUserName();
    const pickedAt = new Date();
    let hasWarnings = false;

    // Track successful picks for tag printing
    const successfulPicks: { toolId: string; qty: number }[] = [];

    for (const alloc of allocations) {
      if (alloc.qty > 0) {
        const result = await this.picksService.recordPick(
          this.distributeItem.id,
          alloc.toolId,
          alloc.qty,
          userName
        );
        if (result) {
          successfulPicks.push(alloc);
          if ('overPickWarning' in result && result.overPickWarning) {
            hasWarnings = true;
          }
        }
      }
    }

    if (hasWarnings) {
      this.overPickWarning = 'Some items may have been over-picked. Another user may have picked items at the same time. Please review the quantities.';
      setTimeout(() => this.overPickWarning = null, 8000);
    }

    // Trigger tag printing dialog if enabled and picks were made
    if (successfulPicks.length > 0 && this.settingsService.isTagPrintingEnabled() && this.order) {
      // Create one tag per tool that received picks
      const tags: TagData[] = successfulPicks.map(alloc => {
        const tool = this.tools.find(t => t.id === alloc.toolId);
        return {
          partNumber: this.distributeItem!.part_number,
          description: this.distributeItem!.description,
          location: this.distributeItem!.location,
          soNumber: this.order!.so_number,
          toolNumber: tool?.tool_number || 'Unknown',
          qtyPicked: alloc.qty,
          pickedBy: userName,
          pickedAt: pickedAt,
        };
      });
      this.printTagData = tags;
      this.showPrintTagDialog = true;
    }

    this.isSubmitting = null;
    this.distributeItem = null;
  }

  closePrintTagDialog(): void {
    this.showPrintTagDialog = false;
    this.printTagData = null;
  }
}
