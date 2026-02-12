import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CsvAssemblyVerifierService, VerificationReport, AssemblyDiscrepancy } from '../../services/csv-assembly-verifier.service';
import { SupabaseService } from '../../services/supabase.service';
import { Order } from '../../models';

interface MigrationStats {
  totalOrders: number;
  totalLineItems: number;
  lineItemsWithStructuredData: number;
  lineItemsWithLegacyOnly: number;
  totalParts: number;
  totalRelationships: number;
}

@Component({
  selector: 'app-assembly-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <div class="mb-4">
        <h1 class="h3 fw-bold mb-1">Assembly Verification</h1>
        <p class="text-muted mb-0">Verify assembly migration from CSV files to structured database</p>
      </div>

      <div class="row">
        <!-- Left Column: Stats and Controls -->
        <div class="col-lg-6">
          <!-- Migration Statistics -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-graph-up me-2"></i>Migration Statistics
              </span>
              <button
                class="btn btn-sm btn-outline-secondary float-end"
                [disabled]="loadingStats"
                (click)="loadStats()"
              >
                <i class="bi" [class]="loadingStats ? 'bi-arrow-clockwise spin' : 'bi-arrow-clockwise'"></i>
              </button>
            </div>
            <div class="card-body">
              <div *ngIf="loadingStats" class="text-center py-3">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <div class="small text-muted mt-2">Loading statistics...</div>
              </div>

              <div *ngIf="!loadingStats && stats">
                <div class="row g-3">
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1 text-primary">{{ stats.totalOrders }}</div>
                      <div class="small text-muted">Total Orders</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1 text-info">{{ stats.totalLineItems }}</div>
                      <div class="small text-muted">Total Line Items</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1 text-success">{{ stats.lineItemsWithStructuredData }}</div>
                      <div class="small text-muted">Structured Data</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1 text-warning">{{ stats.lineItemsWithLegacyOnly }}</div>
                      <div class="small text-muted">Legacy Only</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1">{{ stats.totalParts }}</div>
                      <div class="small text-muted">Parts Catalog</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="border rounded p-3 text-center">
                      <div class="h4 mb-1">{{ stats.totalRelationships }}</div>
                      <div class="small text-muted">Relationships</div>
                    </div>
                  </div>
                </div>

                <div class="mt-3">
                  <div class="progress" style="height: 24px;">
                    <div class="progress-bar bg-success" role="progressbar"
                         [style.width.%]="structuredPercentage"
                         [attr.aria-valuenow]="structuredPercentage"
                         aria-valuemin="0" aria-valuemax="100">
                      <span class="small">{{ structuredPercentage.toFixed(1) }}% Structured</span>
                    </div>
                    <div class="progress-bar bg-warning" role="progressbar"
                         [style.width.%]="legacyPercentage"
                         [attr.aria-valuenow]="legacyPercentage"
                         aria-valuemin="0" aria-valuemax="100">
                      <span class="small">{{ legacyPercentage.toFixed(1) }}% Legacy</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- CSV Verification Tool -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-file-earmark-check me-2"></i>CSV Verification
              </span>
            </div>
            <div class="card-body">
              <p class="small text-muted mb-3">
                Upload an order's CSV file to verify that the assembly structure was migrated correctly to the database.
              </p>

              <!-- Order Selection -->
              <div class="mb-3">
                <label class="form-label">Select Order</label>
                <select class="form-select" [(ngModel)]="selectedOrderId" (change)="onOrderSelected()">
                  <option [value]="null">-- Select an order --</option>
                  <option *ngFor="let order of orders" [value]="order.id">
                    {{ order.so_number }} - {{ order.customer_name }}
                  </option>
                </select>
              </div>

              <!-- CSV File Upload -->
              <div class="mb-3">
                <label class="form-label">Upload CSV File</label>
                <input
                  type="file"
                  class="form-control"
                  accept=".csv"
                  (change)="onCsvFileSelected($event)"
                  [disabled]="!selectedOrderId"
                  #csvFileInput
                >
                <div class="form-text">
                  Upload the original CSV file for SO {{ selectedOrder?.so_number || '(select order)' }}
                </div>
              </div>

              <!-- Verify Button -->
              <button
                class="btn btn-primary w-100"
                [disabled]="!selectedOrderId || !csvFile || verifying"
                (click)="verifyAssembly()"
              >
                <i class="bi me-2" [class]="verifying ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
                {{ verifying ? 'Verifying...' : 'Verify Assembly Structure' }}
              </button>

              <!-- Error Display -->
              <div *ngIf="errorMessage" class="alert alert-danger small mt-3 mb-0">
                <i class="bi bi-exclamation-triangle me-2"></i>
                {{ errorMessage }}
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Verification Report -->
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-clipboard-data me-2"></i>Verification Report
              </span>
              <button
                *ngIf="verificationReport"
                class="btn btn-sm btn-outline-secondary float-end"
                (click)="downloadReport()"
              >
                <i class="bi bi-download me-1"></i>Download
              </button>
            </div>
            <div class="card-body">
              <div *ngIf="!verificationReport" class="text-center text-muted py-5">
                <i class="bi bi-clipboard-data display-4 d-block mb-3 opacity-25"></i>
                <p class="mb-0">No verification report available</p>
                <p class="small">Select an order and upload a CSV file to verify</p>
              </div>

              <div *ngIf="verificationReport">
                <!-- Report Summary -->
                <div class="mb-4">
                  <h6 class="fw-semibold mb-3">Summary</h6>
                  <div class="row g-2 small">
                    <div class="col-6">
                      <strong>SO Number:</strong> {{ verificationReport.soNumber }}
                    </div>
                    <div class="col-6">
                      <strong>File:</strong> {{ verificationReport.fileName }}
                    </div>
                    <div class="col-12">
                      <strong>Verified:</strong> {{ formatDate(verificationReport.verifiedAt) }}
                    </div>
                  </div>
                </div>

                <!-- Statistics -->
                <div class="mb-4">
                  <h6 class="fw-semibold mb-3">Statistics</h6>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Total Parts:</span>
                    <span class="badge bg-primary">{{ verificationReport.summary.totalParts }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Parts in Database:</span>
                    <span class="badge bg-success">{{ verificationReport.summary.partsInDb }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Parts Not in Database:</span>
                    <span class="badge bg-danger">{{ verificationReport.summary.partsNotInDb }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Relationships Verified:</span>
                    <span class="badge bg-success">{{ verificationReport.summary.relationshipsVerified }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Relationships Missing:</span>
                    <span class="badge bg-warning text-dark">{{ verificationReport.summary.relationshipsMissing }}</span>
                  </div>
                  <div class="d-flex justify-content-between mb-2 small">
                    <span>Legacy Text-Only:</span>
                    <span class="badge bg-info">{{ verificationReport.summary.legacyTextOnly }}</span>
                  </div>
                </div>

                <!-- Overall Status -->
                <div class="alert mb-4" [class]="verificationReport.discrepancies.length === 0 ? 'alert-success' : 'alert-warning'">
                  <div class="d-flex align-items-center">
                    <i class="bi me-2" [class]="verificationReport.discrepancies.length === 0 ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'"></i>
                    <div class="flex-grow-1">
                      <strong>
                        {{ verificationReport.discrepancies.length === 0 ? 'Verification Passed' : 'Discrepancies Found' }}
                      </strong>
                      <div class="small">
                        {{ verificationReport.discrepancies.length === 0
                           ? 'CSV structure matches database perfectly'
                           : verificationReport.discrepancies.length + ' issue(s) detected' }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Discrepancies -->
                <div *ngIf="verificationReport.discrepancies.length > 0">
                  <h6 class="fw-semibold mb-3">Discrepancies ({{ verificationReport.discrepancies.length }})</h6>

                  <!-- Severity Tabs -->
                  <ul class="nav nav-tabs nav-fill mb-3" role="tablist">
                    <li class="nav-item" role="presentation">
                      <button class="nav-link" [class.active]="discrepancyFilter === 'all'"
                              (click)="discrepancyFilter = 'all'" type="button">
                        All ({{ verificationReport.discrepancies.length }})
                      </button>
                    </li>
                    <li class="nav-item" role="presentation">
                      <button class="nav-link" [class.active]="discrepancyFilter === 'error'"
                              (click)="discrepancyFilter = 'error'" type="button">
                        Errors ({{ getDiscrepanciesBySeverity('error').length }})
                      </button>
                    </li>
                    <li class="nav-item" role="presentation">
                      <button class="nav-link" [class.active]="discrepancyFilter === 'warning'"
                              (click)="discrepancyFilter = 'warning'" type="button">
                        Warnings ({{ getDiscrepanciesBySeverity('warning').length }})
                      </button>
                    </li>
                    <li class="nav-item" role="presentation">
                      <button class="nav-link" [class.active]="discrepancyFilter === 'info'"
                              (click)="discrepancyFilter = 'info'" type="button">
                        Info ({{ getDiscrepanciesBySeverity('info').length }})
                      </button>
                    </li>
                  </ul>

                  <!-- Discrepancy List -->
                  <div style="max-height: 400px; overflow-y: auto;">
                    <div *ngFor="let discrepancy of getFilteredDiscrepancies(); let i = index"
                         class="border rounded p-3 mb-2 small">
                      <div class="d-flex align-items-start mb-2">
                        <span class="badge me-2"
                              [class]="getSeverityBadgeClass(discrepancy.severity)">
                          {{ discrepancy.severity.toUpperCase() }}
                        </span>
                        <span class="badge bg-secondary me-2">{{ discrepancy.type }}</span>
                      </div>
                      <div class="mb-2">
                        <strong>{{ discrepancy.partNumber }}</strong>
                        <span *ngIf="discrepancy.parentPartNumber" class="text-muted">
                          (under {{ discrepancy.parentPartNumber }})
                        </span>
                      </div>
                      <div class="mb-2">{{ discrepancy.message }}</div>
                      <div *ngIf="hasDetails(discrepancy)" class="bg-body-secondary p-2 rounded">
                        <div *ngIf="discrepancy.details.csvQuantity !== undefined">
                          CSV Qty: {{ discrepancy.details.csvQuantity }}
                        </div>
                        <div *ngIf="discrepancy.details.dbQuantity !== undefined">
                          DB Qty: {{ discrepancy.details.dbQuantity }}
                        </div>
                        <div *ngIf="discrepancy.details.legacyAssemblyGroup">
                          Legacy: {{ discrepancy.details.legacyAssemblyGroup }}
                        </div>
                      </div>
                    </div>

                    <div *ngIf="getFilteredDiscrepancies().length === 0" class="text-center text-muted py-3">
                      No {{ discrepancyFilter }} discrepancies found
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .nav-tabs .nav-link {
      font-size: 0.875rem;
      padding: 0.5rem 0.75rem;
    }
  `]
})
export class AssemblyVerificationComponent implements OnInit, OnDestroy {
  // Migration stats
  stats: MigrationStats | null = null;
  loadingStats = false;

  // Orders list (simplified - only need id, so_number, customer_name for dropdown)
  orders: Pick<Order, 'id' | 'so_number' | 'customer_name'>[] = [];
  selectedOrderId: string | null = null;
  selectedOrder: Order | null = null;

  // CSV verification
  csvFile: File | null = null;
  verifying = false;
  errorMessage: string | null = null;
  verificationReport: VerificationReport | null = null;

  // Discrepancy filter
  discrepancyFilter: 'all' | 'error' | 'warning' | 'info' = 'all';

  private subscriptions: Subscription[] = [];

  constructor(
    private csvAssemblyVerifierService: CsvAssemblyVerifierService,
    private supabase: SupabaseService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadOrders();

    // Subscribe to service observables
    this.subscriptions.push(
      this.csvAssemblyVerifierService.loading$.subscribe(loading => {
        this.verifying = loading;
      }),
      this.csvAssemblyVerifierService.error$.subscribe(error => {
        this.errorMessage = error;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get structuredPercentage(): number {
    if (!this.stats || this.stats.totalLineItems === 0) return 0;
    return (this.stats.lineItemsWithStructuredData / this.stats.totalLineItems) * 100;
  }

  get legacyPercentage(): number {
    if (!this.stats || this.stats.totalLineItems === 0) return 0;
    return (this.stats.lineItemsWithLegacyOnly / this.stats.totalLineItems) * 100;
  }

  async loadStats(): Promise<void> {
    this.loadingStats = true;
    try {
      // Get total orders
      const { count: ordersCount, error: ordersError } = await this.supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

      if (ordersError) throw ordersError;

      // Get total line items
      const { count: lineItemsCount, error: lineItemsError } = await this.supabase
        .from('line_items')
        .select('*', { count: 'exact', head: true });

      if (lineItemsError) throw lineItemsError;

      // Get line items with structured data (has part_id)
      const { count: structuredCount, error: structuredError } = await this.supabase
        .from('line_items')
        .select('*', { count: 'exact', head: true })
        .not('part_id', 'is', null);

      if (structuredError) throw structuredError;

      // Get line items with legacy only (has assembly_group but no part_id)
      const { count: legacyCount, error: legacyError } = await this.supabase
        .from('line_items')
        .select('*', { count: 'exact', head: true })
        .not('assembly_group', 'is', null)
        .is('part_id', null);

      if (legacyError) throw legacyError;

      // Get total parts
      const { count: partsCount, error: partsError } = await this.supabase
        .from('parts')
        .select('*', { count: 'exact', head: true });

      if (partsError) throw partsError;

      // Get total relationships
      const { count: relationshipsCount, error: relationshipsError } = await this.supabase
        .from('part_relationships')
        .select('*', { count: 'exact', head: true });

      if (relationshipsError) throw relationshipsError;

      this.stats = {
        totalOrders: ordersCount || 0,
        totalLineItems: lineItemsCount || 0,
        lineItemsWithStructuredData: structuredCount || 0,
        lineItemsWithLegacyOnly: legacyCount || 0,
        totalParts: partsCount || 0,
        totalRelationships: relationshipsCount || 0
      };
    } catch (error) {
      console.error('Failed to load stats:', error);
      this.errorMessage = 'Failed to load statistics';
    } finally {
      this.loadingStats = false;
    }
  }

  async loadOrders(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select('id, so_number, customer_name')
        .order('so_number', { ascending: false });

      if (error) throw error;
      this.orders = data || [];
    } catch (error) {
      console.error('Failed to load orders:', error);
      this.errorMessage = 'Failed to load orders';
    }
  }

  onOrderSelected(): void {
    this.selectedOrder = this.orders.find(o => o.id === this.selectedOrderId) || null;
    this.csvFile = null;
    this.verificationReport = null;
    this.errorMessage = null;
  }

  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.csvFile = input.files[0];
      this.verificationReport = null;
      this.errorMessage = null;
    }
  }

  async verifyAssembly(): Promise<void> {
    if (!this.selectedOrderId || !this.csvFile) return;

    try {
      this.verifying = true;
      this.errorMessage = null;

      // Read CSV file
      const csvText = await this.readFileAsText(this.csvFile);

      // Parse assembly hierarchy
      const csvAssemblies = this.csvAssemblyVerifierService.parseAssemblyHierarchy(
        csvText,
        this.csvFile.name
      );

      // Verify against database
      const report = await this.csvAssemblyVerifierService.verifyAgainstDatabase(
        csvAssemblies,
        this.selectedOrderId,
        this.csvFile.name
      );

      this.verificationReport = report;
      this.discrepancyFilter = 'all';
    } catch (error) {
      console.error('Verification failed:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Verification failed';
    } finally {
      this.verifying = false;
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  getDiscrepanciesBySeverity(severity: 'error' | 'warning' | 'info'): AssemblyDiscrepancy[] {
    if (!this.verificationReport) return [];
    return this.verificationReport.discrepancies.filter(d => d.severity === severity);
  }

  getFilteredDiscrepancies(): AssemblyDiscrepancy[] {
    if (!this.verificationReport) return [];
    if (this.discrepancyFilter === 'all') {
      return this.verificationReport.discrepancies;
    }
    return this.getDiscrepanciesBySeverity(this.discrepancyFilter);
  }

  getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'error':
        return 'bg-danger';
      case 'warning':
        return 'bg-warning text-dark';
      case 'info':
        return 'bg-info';
      default:
        return 'bg-secondary';
    }
  }

  hasDetails(discrepancy: AssemblyDiscrepancy): boolean {
    return discrepancy.details.csvQuantity !== undefined ||
           discrepancy.details.dbQuantity !== undefined ||
           !!discrepancy.details.legacyAssemblyGroup;
  }

  formatDate(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  downloadReport(): void {
    if (!this.verificationReport) return;

    const reportText = this.csvAssemblyVerifierService.generateVerificationReport(this.verificationReport);
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-report-${this.verificationReport.soNumber}-${Date.now()}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
