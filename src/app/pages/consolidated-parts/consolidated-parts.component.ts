import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConsolidatedPartsService } from '../../services/consolidated-parts.service';
import { PicksService } from '../../services/picks.service';
import { SettingsService } from '../../services/settings.service';
import { PartIssuesService } from '../../services/part-issues.service';
import { PartsService } from '../../services/parts.service';
import { UtilsService } from '../../services/utils.service';
import { ExcelService } from '../../services/excel.service';
import { SupabaseService } from '../../services/supabase.service';
import { ConsolidatedPart, PartIssueType } from '../../models';
import { MultiOrderPickDialogComponent } from '../../components/dialogs/multi-order-pick-dialog.component';
import { ReportPartIssueDialogComponent } from '../../components/dialogs/report-part-issue-dialog.component';
import { PartDetailComponent } from '../../components/parts/part-detail.component';
import { PrintTagDialogComponent, TagData } from '../../components/picking/print-tag-dialog.component';

type FilterType = 'all' | 'remaining' | 'complete' | 'low_stock' | 'out_of_stock' | 'has_issues';

@Component({
  selector: 'app-consolidated-parts',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MultiOrderPickDialogComponent, ReportPartIssueDialogComponent, PartDetailComponent, PrintTagDialogComponent],
  template: `
    <div>
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h1 class="h3 fw-bold mb-1">Part Picker</h1>
          <p class="text-muted mb-0">View all parts needed across active orders</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-primary" (click)="copyPartNumbers()" [disabled]="filteredParts.length === 0">
            <i class="bi bi-clipboard me-1"></i>
            Copy Part Numbers
          </button>
          <button class="btn btn-outline-secondary" (click)="exportPartNumbers()" [disabled]="filteredParts.length === 0">
            <i class="bi bi-download me-1"></i>
            Export Part #s
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
              <small class="text-muted">&nbsp;</small>
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
                <button class="btn btn-sm"
                        [class.btn-info]="filter === 'has_issues'"
                        [class.btn-outline-info]="filter !== 'has_issues'"
                        (click)="setFilter('has_issues')">
                  Has Issues
                  <span class="badge bg-secondary ms-1" *ngIf="issueCount > 0">{{ issueCount }}</span>
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
                <div class="form-check ms-3">
                  <input class="form-check-input" type="checkbox" id="hideIssues"
                         [(ngModel)]="hideIssues">
                  <label class="form-check-label" for="hideIssues">
                    Hide issues
                    <span *ngIf="issueCount > 0" class="badge bg-secondary ms-1">{{ issueCount }}</span>
                  </label>
                </div>
                <select class="form-select form-select-sm ms-3" style="width: auto;"
                        [(ngModel)]="sortMode">
                  <option value="part_number">Sort: Part Number</option>
                  <option value="location">Sort: Location</option>
                  <option value="assembly">Sort: Assembly</option>
                </select>
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

      <!-- Error Message -->
      <div *ngIf="error" class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>{{ error }}
      </div>

      <!-- Parts List -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading parts...</div>
      </div>

      <div *ngIf="!loading && !error && filteredParts.length === 0" class="card">
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
              <ng-container *ngFor="let part of sortedParts; let idx = index">
                <!-- Location Group Header -->
                <tr *ngIf="sortMode === 'location' && shouldShowLocationHeader(part, idx)" class="location-group-header">
                  <td colspan="9" class="py-2">
                    <div class="d-flex align-items-center gap-2">
                      <i class="bi bi-geo-alt text-primary"></i>
                      <strong>{{ getLocationPrefix(part.location) || 'No Location' }}</strong>
                      <span class="badge bg-secondary">{{ getLocationGroupCount(part) }} parts</span>
                    </div>
                  </td>
                </tr>
                <!-- Assembly Group Header -->
                <tr *ngIf="sortMode === 'assembly' && shouldShowAssemblyGroupHeader(part, idx)" class="assembly-group-header">
                  <td colspan="9" class="py-2">
                    <div class="d-flex align-items-center gap-2">
                      <i class="bi bi-box-seam text-purple"></i>
                      <strong>{{ getPartAssemblyName(part) || 'Unassigned' }}</strong>
                      <span class="badge bg-secondary">{{ getAssemblyGroupCount(part) }} parts</span>
                    </div>
                  </td>
                </tr>
              <tr [id]="'part-row-' + idx"
                  [class.table-success]="part.remaining === 0"
                  [class.table-warning]="part.total_picked > 0 && part.remaining > 0"
                  [class.table-danger]="getQtyAvailable(part) === 0 && part.remaining > 0">
                  <div class="d-flex align-items-center gap-2">
                    <span class="text-primary" style="cursor: pointer;" (click)="openPartDetail(part.part_number, $event)" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ part.part_number }}</span>
                    <button class="btn btn-sm btn-ghost p-0 text-muted" (click)="copyPartNumber(part.part_number, $event)" title="Copy Part Number">
                      <i class="bi" [ngClass]="copiedPartNumber === part.part_number ? 'bi-check-lg text-success' : 'bi-copy'"></i>
                    </button>
                    <span class="badge bg-danger" *ngIf="hasPartIssue(part.part_number)">
                      <i class="bi bi-exclamation-triangle-fill"></i> Issue
                    </span>
                  </div>
                  <div *ngIf="getPartAssemblies(part).length > 0" class="d-flex flex-direction-column gap-1 mt-1">
                    <span *ngFor="let asm of getPartAssemblies(part)" class="badge small text-start fw-normal font-monospace"
                          style="white-space: pre-wrap;"
                          [ngClass]="{
                            'bg-light text-dark border': true
                          }">
                      {{ asm }}
                    </span>
                  </div>
                </td>
                <td [ngClass]="{
                      'text-success-emphasis': part.remaining === 0,
                      'text-warning-emphasis': part.total_picked > 0 && part.remaining > 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0),
                      'text-danger-emphasis': getQtyAvailable(part) === 0 && part.remaining > 0,
                      'text-muted': part.total_picked === 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0)
                    }">{{ part.description || '-' }}</td>
                <td [ngClass]="{
                      'text-success-emphasis': part.remaining === 0,
                      'text-warning-emphasis': part.total_picked > 0 && part.remaining > 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0),
                      'text-danger-emphasis': getQtyAvailable(part) === 0 && part.remaining > 0
                    }">{{ part.location || '-' }}</td>
                <td class="text-center">
                  <span [ngClass]="{
                          'text-danger-emphasis': getQtyAvailable(part) === 0 && part.remaining > 0,
                          'fw-bold': getQtyAvailable(part) !== null && getQtyAvailable(part)! < part.remaining && part.remaining !== 0,
                          'text-warning-emphasis': part.total_picked > 0 && part.remaining > 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0),
                          'text-success-emphasis': part.remaining === 0
                        }">
                    {{ getQtyAvailable(part) ?? '-' }}
                  </span>
                </td>
                <td class="text-center" [ngClass]="{
                      'text-success-emphasis': part.remaining === 0,
                      'text-warning-emphasis': part.total_picked > 0 && part.remaining > 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0),
                      'text-danger-emphasis': getQtyAvailable(part) === 0 && part.remaining > 0
                    }">{{ part.total_needed }}</td>
                <td class="text-center" [ngClass]="{
                      'text-success-emphasis': part.remaining === 0,
                      'text-warning-emphasis': part.total_picked > 0 && part.remaining > 0 && !(getQtyAvailable(part) === 0 && part.remaining > 0),
                      'text-danger-emphasis': getQtyAvailable(part) === 0 && part.remaining > 0
                    }">{{ part.total_picked }}</td>
                <td class="text-center">
                  <span class="badge" [ngClass]="part.remaining === 0 ? 'bg-success' : 'bg-warning text-dark'">
                    {{ part.remaining }}
                  </span>
                </td>
                <td>
                  <div class="position-relative order-hover-container">
                    <span class="badge rounded-pill bg-light text-dark border cursor-pointer">
                      {{ part.orders.length }} Order{{ part.orders.length !== 1 ? 's' : '' }}
                      <i class="bi bi-chevron-down ms-1" style="font-size: 0.7em;"></i>
                    </span>
                    <div class="order-details-popover shadow border rounded p-2 bg-white position-absolute start-0 top-100 mt-1" style="z-index: 1050; width: 280px; display: none;">
                      <div class="d-flex flex-column gap-1">
                        <a *ngFor="let order of part.orders"
                           [routerLink]="['/orders', order.order_id]"
                           class="badge border text-decoration-none text-start p-2 d-block"
                           [ngClass]="part.remaining === 0 ? 'bg-success-subtle text-success-emphasis border-success' : 'bg-body-secondary text-body'"
                           [title]="'SO-' + order.so_number + ' - ' + order.tool_number">
                          <div class="d-flex justify-content-between">
                            <strong>SO-{{ order.so_number }}</strong>
                            <span>{{ order.tool_number }}</span>
                          </div>
                          <div class="small mt-1" [ngClass]="part.remaining === 0 ? 'text-success' : 'text-muted'">
                            Picked: {{ order.picked }} / {{ order.needed }}
                            <span *ngIf="order.tool_model" class="d-block text-truncate mt-1 fst-italic">{{ order.tool_model }}</span>
                          </div>
                        </a>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="text-center">
                  <div class="d-flex gap-1 justify-content-center">
                    <button
                      class="btn btn-outline-primary"
                      (click)="openMultiOrderPick(part)"
                      title="Pick across orders"
                      style="width: 40px; height: 38px;"
                    >
                      <i class="bi bi-box-arrow-in-down"></i>
                    </button>
                    <button
                      class="btn"
                      [ngClass]="hasPartIssue(part.part_number) ? 'btn-danger' : 'btn-outline-warning'"
                      (click)="openReportIssue(part)"
                      title="Report issue"
                      style="width: 40px; height: 38px;"
                    >
                      <i class="bi bi-exclamation-triangle"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </ng-container>
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

    <!-- Report Part Issue Dialog -->
    <app-report-part-issue-dialog
      [(show)]="showReportIssue"
      [partNumber]="selectedPartForIssue?.part_number ?? null"
      [partDescription]="selectedPartForIssue?.description ?? null"
      [partLocation]="selectedPartForIssue?.location ?? null"
      [existingIssue]="selectedPartForIssue ? partIssuesService.getOpenIssue(selectedPartForIssue.part_number) ?? null : null"
      (submitIssue)="handleSubmitIssue($event)"
      (resolveIssue)="handleResolveIssue($event)"
    ></app-report-part-issue-dialog>

    <!-- Print Tag Dialog -->
    <app-print-tag-dialog
      [isOpen]="showPrintTagDialog"
      [tags]="printTagData || []"
      (close)="closePrintTagDialog()"
    ></app-print-tag-dialog>
  `,
  styles: [`
    .cursor-pointer {
      cursor: pointer;
      transition: border-color 0.15s ease-in-out;
    }
    .cursor-pointer:hover {
      border-color: var(--bs-primary) !important;
    }
    .location-group-header td {
      background-color: rgba(13, 110, 253, 0.08) !important;
      border-left: 3px solid #0d6efd;
    }
    :host-context([data-bs-theme="dark"]) .location-group-header td {
      background-color: rgba(13, 110, 253, 0.15) !important;
    }
    .assembly-group-header td {
      background-color: rgba(111, 66, 193, 0.08) !important;
      border-left: 3px solid #6f42c1;
    }
    :host-context([data-bs-theme="dark"]) .assembly-group-header td {
      background-color: rgba(111, 66, 193, 0.15) !important;
    }
    .text-purple { color: #6f42c1; }
    .bg-purple-subtle { background-color: rgba(111, 66, 193, 0.1); }
    .border-purple { border-color: #6f42c1 !important; }
    .order-hover-container:hover .order-details-popover {
      display: block !important;
    }
  `]
})
export class ConsolidatedPartsComponent implements OnInit, OnDestroy {
  parts: ConsolidatedPart[] = [];
  loading = true;
  error: string | null = null;
  searchQuery = '';
  filter: FilterType = 'all';
  copyMessage = '';
  hideOutOfStock = false;
  showOutOfStockOnly = false;
  hideIssues = false;
  sortMode: 'part_number' | 'location' | 'assembly' = 'part_number';
  selectedAssemblies = new Set<string>();

  // Multi-order pick dialog
  @ViewChild(MultiOrderPickDialogComponent) multiOrderPickDialog?: MultiOrderPickDialogComponent;
  showMultiOrderPick = false;
  selectedPart: ConsolidatedPart | null = null;
  scrollToPartNumber: string | null = null;

  // Part issue dialog
  showReportIssue = false;
  selectedPartForIssue: ConsolidatedPart | null = null;

  // Print Tag Dialog
  showPrintTagDialog = false;
  printTagData: TagData[] | null = null;

  copiedPartNumber: string | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private partsService: ConsolidatedPartsService,
    private picksService: PicksService,
    private settingsService: SettingsService,
    public partIssuesService: PartIssuesService,
    public utils: UtilsService,
    private excelService: ExcelService,
    private route: ActivatedRoute,
    private router: Router,
    private catalogPartsService: PartsService,
    private modalService: NgbModal,
    private supabase: SupabaseService
  ) { }

  ngOnInit(): void {
    // Read URL search parameter on init
    const urlSearch = this.route.snapshot.queryParamMap.get('search');
    if (urlSearch) {
      this.searchQuery = urlSearch;
      // Clear URL param to keep URL clean
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    this.partIssuesService.initialize();

    this.subscriptions.push(
      this.partsService.parts$.subscribe(parts => {
        this.parts = parts;
        // Scroll to tracked part after data refresh
        if (this.scrollToPartNumber) {
          this.scrollToPartByNumber();
        }
      }),
      this.partsService.loading$.subscribe(loading => {
        this.loading = loading;
      }),
      this.partsService.error$.subscribe(error => {
        this.error = error;
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
    // Return qty_available directly from the part object instead of the map
    return part.qty_available;
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
        case 'has_issues':
          matchesFilter = this.partIssuesService.hasOpenIssue(part.part_number);
          break;
      }

      // Hide out of stock filter - excludes parts where qty_available is 0
      const matchesStock = !this.hideOutOfStock || (this.getQtyAvailable(part) !== 0);

      // Show out of stock only filter - includes only parts where qty_available is 0
      const matchesOutOfStockOnly = !this.showOutOfStockOnly || this.getQtyAvailable(part) === 0;

      // Assembly filter - check if any of the part's orders match a selected assembly
      const matchesAssembly = this.selectedAssemblies.size === 0 ||
        part.orders.some(o => !!o.tool_model && this.selectedAssemblies.has(o.tool_model));

      // Hide issues filter
      const matchesIssues = !this.hideIssues || !this.partIssuesService.hasOpenIssue(part.part_number);

      return matchesSearch && matchesFilter && matchesStock && matchesOutOfStockOnly && matchesAssembly && matchesIssues;
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

  openMultiOrderPick(part: ConsolidatedPart): void {
    this.selectedPart = part;
    this.showMultiOrderPick = true;
  }

  async handleMultiOrderPick(picks: { lineItemId: string; toolId: string; qty: number }[]): Promise<void> {
    const settings = this.settingsService.getSettings();
    const userName = settings.user_name || 'Unknown';
    const pickedAt = new Date();

    // Track part for scroll after refresh
    if (this.selectedPart) {
      this.scrollToPartNumber = this.selectedPart.part_number;
    }

    const successfulPicks: { lineItemId: string; toolId: string; qty: number }[] = [];

    try {
      // Process each pick (positive = add, negative = undo)
      for (const pick of picks) {
        if (pick.qty > 0) {
          // Positive quantity: record a new pick
          const result = await this.picksService.recordPick(
            pick.lineItemId,
            pick.toolId,
            pick.qty,
            userName
          );
          if (result) {
            successfulPicks.push(pick);
          }
        } else if (pick.qty < 0) {
          // Negative quantity: undo recent picks
          await this.undoPicksByQuantity(
            pick.lineItemId,
            pick.toolId,
            Math.abs(pick.qty),
            userName
          );
        }
      }

      // Wait for the parts list to refresh completely before proceeding
      await this.partsService.fetchParts();

      // Trigger tag printing dialog if enabled and positive picks were made
      // This ensures we DO NOT show the dialog for negative picks (corrections/reductions)
      if (successfulPicks.length > 0 && this.selectedPart && this.settingsService.isTagPrintingEnabled()) {
        const tags: TagData[] = successfulPicks.map(pick => {
          // Since we don't have direct access to tool number/SO number here easily without re-fetching,
          // we can rely on the part.orders data which should have this info.
          // Or we can construct it if available.
          // However, consolidated part has array of orders.
          const orderInfo = this.selectedPart?.orders.find(o => o.line_item_id === pick.lineItemId && o.tool_id === pick.toolId);

          return {
            partNumber: this.selectedPart!.part_number,
            description: this.selectedPart!.description,
            location: this.selectedPart!.location,
            soNumber: orderInfo?.so_number || 'Unknown',
            toolNumber: orderInfo?.tool_number || 'Unknown',
            qtyPicked: pick.qty,
            pickedBy: userName,
            pickedAt: pickedAt,
            assembly: orderInfo?.assembly_group
          };
        });

        this.printTagData = tags;
        this.showPrintTagDialog = true;
      }

      // Give Angular a moment to update the view
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error recording picks:', error);
    } finally {
      // Notify the dialog that the operation is complete
      this.multiOrderPickDialog?.completePick();
    }
  }

  closePrintTagDialog(): void {
    this.showPrintTagDialog = false;
    this.printTagData = null;
  }

  private async undoPicksByQuantity(
    lineItemId: string,
    toolId: string,
    qtyToUndo: number,
    undoneBy: string
  ): Promise<void> {
    // Fetch all active picks for this line item and tool, sorted by most recent first
    const { data: picks, error } = await this.supabase.from('picks')
      .select('id, qty_picked')
      .eq('line_item_id', lineItemId)
      .eq('tool_id', toolId)
      .is('undone_at', null)
      .order('picked_at', { ascending: false });

    if (error || !picks) {
      console.error('Error fetching picks to undo:', error);
      return;
    }

    let remainingToUndo = qtyToUndo;

    // Undo picks starting from most recent until we've undone the requested quantity
    for (const pick of picks) {
      if (remainingToUndo <= 0) break;

      if (pick.qty_picked <= remainingToUndo) {
        // Undo the entire pick
        await this.picksService.undoPick(pick.id, undoneBy);
        remainingToUndo -= pick.qty_picked;
      } else {
        // This pick has more than we need to undo
        // We can't partially undo a pick, so we'll undo it and re-record the difference
        await this.picksService.undoPick(pick.id, undoneBy);
        const difference = pick.qty_picked - remainingToUndo;
        await this.picksService.recordPick(
          lineItemId,
          toolId,
          difference,
          undoneBy,
          'Corrected from partial undo'
        );
        remainingToUndo = 0;
      }
    }

    if (remainingToUndo > 0) {
      console.warn(`Could not undo full quantity. ${remainingToUndo} remaining.`);
    }
  }

  // Sorting and grouping
  get sortedParts(): ConsolidatedPart[] {
    const parts = [...this.filteredParts];
    if (this.sortMode === 'location') {
      parts.sort((a, b) => {
        const aLoc = this.getLocationPrefix(a.location) || 'zzz';
        const bLoc = this.getLocationPrefix(b.location) || 'zzz';
        const locCompare = aLoc.localeCompare(bLoc, undefined, { numeric: true });
        if (locCompare !== 0) return locCompare;
        return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
      });
    } else if (this.sortMode === 'assembly') {
      parts.sort((a, b) => {
        const aAsm = this.getPartAssemblyName(a) || 'zzz';
        const bAsm = this.getPartAssemblyName(b) || 'zzz';
        const asmCompare = aAsm.localeCompare(bAsm, undefined, { numeric: true });
        if (asmCompare !== 0) return asmCompare;
        return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
      });
    } else {
      parts.sort((a, b) => a.part_number.localeCompare(b.part_number, undefined, { numeric: true }));
    }
    return parts;
  }

  getLocationPrefix(location: string | null | undefined): string {
    if (!location) return '';
    const parts = location.split('-');
    if (parts.length >= 2) return parts.slice(0, 2).join('-');
    return parts[0];
  }

  getPartAssemblyName(part: ConsolidatedPart): string {
    const models = new Set<string>();
    part.orders.forEach(o => {
      if (o.tool_model) models.add(o.tool_model);
    });
    return Array.from(models).sort().join(', ');
  }


  getPartAssemblies(part: ConsolidatedPart): string[] {
    const assemblies = new Set<string>();
    part.orders.forEach(o => {
      if (o.assembly_group) {
        assemblies.add(this.formatAssemblyPath(o.assembly_group));
      }
    });

    // If no explicit assemblies, use tool models if they look like assemblies (optional, but requested "Below part number... display assembly tree")
    // If we want to strictly follow "Assembly Tree", we should only show formatted paths.
    // If the set is empty, we return empty array, so nothing shows.
    return Array.from(assemblies).sort();
  }

  formatAssemblyPath(assembly: string | null | undefined): string {
    if (!assembly) return '';
    const parts = assembly.split(' > ');
    parts.reverse();
    return ' < ' + parts.join(' < ');
  }

  shouldShowLocationHeader(part: ConsolidatedPart, index: number): boolean {
    if (index === 0) return true;
    const sorted = this.sortedParts;
    const prevPart = sorted[index - 1];
    return this.getLocationPrefix(part.location) !== this.getLocationPrefix(prevPart.location);
  }

  shouldShowAssemblyGroupHeader(part: ConsolidatedPart, index: number): boolean {
    if (index === 0) return true;
    const sorted = this.sortedParts;
    const prevPart = sorted[index - 1];
    return this.getPartAssemblyName(part) !== this.getPartAssemblyName(prevPart);
  }

  getLocationGroupCount(part: ConsolidatedPart): number {
    const prefix = this.getLocationPrefix(part.location);
    return this.sortedParts.filter(p => this.getLocationPrefix(p.location) === prefix).length;
  }

  getAssemblyGroupCount(part: ConsolidatedPart): number {
    const name = this.getPartAssemblyName(part);
    return this.sortedParts.filter(p => this.getPartAssemblyName(p) === name).length;
  }

  // Export part numbers to Excel
  async exportPartNumbers(): Promise<void> {
    const partNumbers = this.filteredParts.map(p => p.part_number);
    await this.excelService.exportPartNumbersToExcel(partNumbers);
  }

  // Part Issues
  get issueCount(): number {
    return this.parts.filter(p => this.partIssuesService.hasOpenIssue(p.part_number)).length;
  }

  hasPartIssue(partNumber: string): boolean {
    return this.partIssuesService.hasOpenIssue(partNumber);
  }

  openReportIssue(part: ConsolidatedPart): void {
    this.selectedPartForIssue = part;
    this.showReportIssue = true;
  }

  async handleSubmitIssue(event: { issueType: PartIssueType; description: string }): Promise<void> {
    if (!this.selectedPartForIssue) return;
    const userName = this.settingsService.getUserName();
    await this.partIssuesService.reportIssue(
      this.selectedPartForIssue.part_number,
      event.issueType,
      event.description || undefined,
      userName || undefined
    );
    this.showReportIssue = false;
    this.selectedPartForIssue = null;
  }

  async handleResolveIssue(issueId: string): Promise<void> {
    const userName = this.settingsService.getUserName();
    await this.partIssuesService.resolveIssue(issueId, userName || undefined);
    this.showReportIssue = false;
    this.selectedPartForIssue = null;
  }

  async openPartDetail(partNumber: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const part = await this.catalogPartsService.getPartByPartNumber(partNumber);
    if (part) {
      const modalRef = this.modalService.open(PartDetailComponent, {
        size: 'lg',
        scrollable: true
      });
      modalRef.componentInstance.partId = part.id;
    }
  }
}
