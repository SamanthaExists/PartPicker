import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { InventorySyncService, SyncResult as InventorySyncResult } from '../../services/inventory-sync.service';
import { PartListSyncService, SyncResult as PartListSyncResult } from '../../services/part-list-sync.service';
import { ApiSyncService, ApiSyncResult, ApiSyncProgress } from '../../services/api-sync.service';
import { ExcelService } from '../../services/excel.service';
import { OfflineService } from '../../services/offline.service';
import { UserSettings } from '../../models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Configure your preferences and manage data</p>
      </div>

      <div class="row">
        <div class="col-lg-6">
          <!-- User Settings -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-person me-2"></i>User Settings
              </span>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label class="form-label">Your Name</label>
                <input type="text" class="form-control" placeholder="Enter your name"
                       [(ngModel)]="userName"
                       (blur)="saveUserName()">
                <div class="form-text">This name will be recorded when you pick items</div>
              </div>
            </div>
          </div>

          <!-- Theme Settings -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-palette me-2"></i>Appearance
              </span>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label class="form-label">Theme</label>
                <select class="form-select" [(ngModel)]="theme" (change)="saveTheme()">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System (auto)</option>
                </select>
                <div class="form-text">Choose your preferred color scheme</div>
              </div>
            </div>
          </div>

          <!-- Tag Printing -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-printer me-2"></i>Tag Printing
              </span>
            </div>
            <div class="card-body">
              <div class="d-flex align-items-center justify-content-between mb-3">
                <div>
                  <div class="fw-medium">Enable Tag Printing</div>
                  <div class="form-text">Show print dialog after picking parts</div>
                </div>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" role="switch"
                         [(ngModel)]="tagPrintingEnabled"
                         (change)="saveTagPrinting()">
                </div>
              </div>

              <div class="small text-muted">
                <div class="fw-medium text-body mb-2">Printer Setup:</div>
                <ul class="ps-3 mb-2">
                  <li><strong>Printer:</strong> Brother P-Touch QL500</li>
                  <li><strong>Label Size:</strong> 0.66" x 3.4" (landscape)</li>
                  <li>Each part/tool combination gets one tag</li>
                </ul>
                <div class="alert alert-light small py-2 mb-0">
                  <i class="bi bi-lightbulb me-1"></i>
                  Tip: Set the Brother QL500 as your default printer for faster printing.
                </div>
              </div>
            </div>
          </div>

          <!-- App Status -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-wifi me-2"></i>App Status
              </span>
            </div>
            <div class="card-body">
              <!-- Connection Status -->
              <div class="d-flex align-items-center justify-content-between mb-3">
                <span>Connection Status</span>
                <span [class]="isOnline ? 'badge bg-success' : 'badge bg-danger'">
                  <i [class]="isOnline ? 'bi bi-wifi me-1' : 'bi bi-wifi-off me-1'"></i>
                  {{ isOnline ? 'Online' : 'Offline' }}
                </span>
              </div>

              <!-- Offline Queue -->
              <div class="d-flex align-items-center justify-content-between mb-3">
                <span>Offline Queue</span>
                <span class="badge" [class]="offlineQueueCount > 0 ? 'bg-warning text-dark' : 'bg-secondary'">
                  {{ offlineQueueCount }} pending {{ offlineQueueCount === 1 ? 'pick' : 'picks' }}
                </span>
              </div>

              <!-- Sync Button -->
              <button
                *ngIf="offlineQueueCount > 0"
                class="btn btn-warning w-100 mb-3"
                [disabled]="isSyncing || !isOnline"
                (click)="syncOfflineQueue()"
              >
                <i class="bi bi-cloud-upload me-2" [class.spin]="isSyncing"></i>
                {{ isSyncing ? 'Syncing...' : 'Sync Offline Picks' }}
              </button>

              <!-- PWA Install -->
              <div class="d-flex align-items-center justify-content-between">
                <span>Install as App</span>
                <button
                  class="btn btn-sm btn-outline-primary"
                  [disabled]="!canInstallPwa"
                  (click)="installPwa()"
                >
                  <i class="bi bi-download me-1"></i>
                  Install
                </button>
              </div>
              <div class="form-text" *ngIf="!canInstallPwa">
                App is already installed or not installable in this browser
              </div>
            </div>
          </div>

          <!-- About -->
          <div class="card">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-info-circle me-2"></i>About
              </span>
            </div>
            <div class="card-body">
              <p class="mb-2"><strong>Tool Pick List Tracker v1.0.0</strong></p>
              <p class="text-muted small mb-2">
                A comprehensive application for managing pick lists and tracking picking progress for sales orders.
              </p>
              <p class="text-muted small mb-3">
                Built with Angular and Bootstrap. Data stored in Supabase.
              </p>
              <button class="btn btn-sm btn-outline-secondary" (click)="showSchema = !showSchema">
                <i class="bi me-1" [class]="showSchema ? 'bi-chevron-up' : 'bi-code-square'"></i>
                {{ showSchema ? 'Hide' : 'Show' }} Database Schema
              </button>
              <div *ngIf="showSchema" class="mt-3">
                <div class="d-flex justify-content-end mb-2">
                  <button class="btn btn-sm btn-outline-secondary" (click)="copySchema()">
                    <i class="bi me-1" [class]="schemaCopied ? 'bi-check-lg' : 'bi-clipboard'"></i>
                    {{ schemaCopied ? 'Copied!' : 'Copy to Clipboard' }}
                  </button>
                </div>
                <pre class="bg-body-secondary p-3 rounded small" style="max-height: 400px; overflow-y: auto; white-space: pre-wrap;">{{ schemaSql }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <!-- Inventory Sync -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-box-seam me-2"></i>Inventory Sync
              </span>
            </div>
            <div class="card-body">
              <p class="small text-muted mb-3">
                Upload an inventory Excel file to update stock quantities and locations.
                Expected columns: Product ID, Lot ID, Location, Qty Available.
              </p>

              <div class="mb-3">
                <input
                  type="file"
                  class="form-control"
                  accept=".xlsx,.xls"
                  (change)="onInventoryFileSelected($event)"
                  #inventoryFileInput
                >
              </div>

              <button
                class="btn btn-primary w-100"
                [disabled]="!inventoryFile || inventorySyncing"
                (click)="syncInventory()"
              >
                <i class="bi me-2" [class]="inventorySyncing ? 'bi-arrow-clockwise spin' : 'bi-cloud-upload'"></i>
                {{ inventorySyncing ? 'Syncing...' : 'Sync Inventory' }}
              </button>

              <!-- Inventory Sync Results -->
              <div *ngIf="inventorySyncResult" class="mt-3">
                <div [class]="inventorySyncResult.success ? 'alert alert-success' : 'alert alert-warning'" class="small mb-2">
                  <div class="fw-semibold mb-1">
                    {{ inventorySyncResult.success ? 'Sync Complete' : 'Sync Completed with Issues' }}
                  </div>
                  <div>Updated: {{ inventorySyncResult.updatedCount }} line items</div>
                  <div>Not found: {{ inventorySyncResult.notFoundCount }} line items</div>
                </div>

                <div *ngIf="inventorySyncResult.errors.length > 0" class="alert alert-danger small mb-2">
                  <div class="fw-semibold mb-1">Errors:</div>
                  <ul class="mb-0 ps-3">
                    <li *ngFor="let error of inventorySyncResult.errors">{{ error }}</li>
                  </ul>
                </div>

                <div *ngIf="inventorySyncResult.notFoundParts.length > 0">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    (click)="showNotFoundParts = !showNotFoundParts"
                  >
                    {{ showNotFoundParts ? 'Hide' : 'Show' }} {{ inventorySyncResult.notFoundParts.length }} not found parts
                  </button>
                  <div *ngIf="showNotFoundParts" class="mt-2 p-2 bg-body-secondary rounded small" style="max-height: 150px; overflow-y: auto;">
                    <code *ngFor="let part of inventorySyncResult.notFoundParts; let last = last">
                      {{ part }}{{ last ? '' : ', ' }}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Part List Sync -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-list-check me-2"></i>Part List Sync
              </span>
            </div>
            <div class="card-body">
              <p class="small text-muted mb-3">
                Upload a Part List Excel file to update locations, descriptions, and quantities.
                Expected columns: Product ID, Location, Qty Available, Qty On Order, Description.
              </p>

              <div class="mb-3">
                <input
                  type="file"
                  class="form-control"
                  accept=".xlsx,.xls"
                  (change)="onPartListFileSelected($event)"
                  #partListFileInput
                >
              </div>

              <button
                class="btn btn-primary w-100"
                [disabled]="!partListFile || partListSyncing"
                (click)="syncPartList()"
              >
                <i class="bi me-2" [class]="partListSyncing ? 'bi-arrow-clockwise spin' : 'bi-cloud-upload'"></i>
                {{ partListSyncing ? 'Syncing...' : 'Sync Part List' }}
              </button>

              <!-- Part List Sync Results -->
              <div *ngIf="partListSyncResult" class="mt-3">
                <div [class]="partListSyncResult.success ? 'alert alert-success' : 'alert alert-warning'" class="small mb-2">
                  <div class="fw-semibold mb-1">
                    {{ partListSyncResult.success ? 'Sync Complete' : 'Sync Completed with Issues' }}
                  </div>
                  <div>Updated: {{ partListSyncResult.updatedCount }} line items</div>
                  <div>Not found: {{ partListSyncResult.notFoundCount }} line items</div>
                </div>

                <div *ngIf="partListSyncResult.errors.length > 0" class="alert alert-danger small mb-2">
                  <div class="fw-semibold mb-1">Errors:</div>
                  <ul class="mb-0 ps-3">
                    <li *ngFor="let error of partListSyncResult.errors">{{ error }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- API Sync -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-globe me-2"></i>API Sync
              </span>
            </div>
            <div class="card-body">
              <p class="small text-muted mb-3">
                Sync qty available, qty on order, and descriptions directly from the Andrews Tool API.
              </p>

              <div class="mb-3">
                <label class="form-label small">
                  <i class="bi bi-lock me-1"></i>Password Required
                </label>
                <div class="d-flex gap-2">
                  <input
                    type="password"
                    class="form-control"
                    placeholder="Enter sync password"
                    [(ngModel)]="apiPassword"
                  >
                  <button
                    class="btn btn-primary flex-shrink-0"
                    [disabled]="!isApiPasswordCorrect || apiSyncing"
                    (click)="syncFromApi()"
                  >
                    <i class="bi me-1" [class]="apiSyncing ? 'bi-arrow-clockwise spin' : 'bi-globe'"></i>
                    {{ apiSyncing ? 'Syncing...' : 'Sync from API' }}
                  </button>
                </div>
              </div>

              <!-- Progress -->
              <div *ngIf="apiSyncing && apiProgress" class="mb-3">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="text-muted">{{ apiProgress.status }}</span>
                  <span class="fw-medium">{{ apiProgress.currentBatch }} / {{ apiProgress.totalBatches }}</span>
                </div>
                <div class="progress">
                  <div
                    class="progress-bar"
                    role="progressbar"
                    [style.width.%]="apiProgress.totalBatches > 0 ? (apiProgress.currentBatch / apiProgress.totalBatches) * 100 : 0"
                  ></div>
                </div>
              </div>

              <!-- Results -->
              <div *ngIf="apiSyncResult && !apiSyncing" class="mt-3">
                <div [class]="apiSyncResult.success ? 'alert alert-success' : 'alert alert-warning'" class="small mb-2">
                  <div class="fw-semibold mb-1">
                    {{ apiSyncResult.success ? 'API Sync Complete' : 'API Sync Failed' }}
                  </div>
                  <div>Updated: {{ apiSyncResult.updatedCount }} line items</div>
                  <div *ngIf="apiSyncResult.notFoundCount > 0" class="text-warning">
                    Not found in API: {{ apiSyncResult.notFoundCount }} line items
                    ({{ apiSyncResult.notFoundParts.length }} unique parts)
                  </div>
                </div>

                <div *ngIf="apiSyncResult.errors.length > 0" class="alert alert-danger small mb-2">
                  <div class="fw-semibold mb-1">Errors:</div>
                  <ul class="mb-0 ps-3">
                    <li *ngFor="let error of apiSyncResult.errors">{{ error }}</li>
                  </ul>
                </div>

                <div *ngIf="apiSyncResult.notFoundParts.length > 0 && apiSyncResult.notFoundParts.length <= 20">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    (click)="showApiNotFoundParts = !showApiNotFoundParts"
                  >
                    {{ showApiNotFoundParts ? 'Hide' : 'Show' }} {{ apiSyncResult.notFoundParts.length }} not found parts
                  </button>
                  <div *ngIf="showApiNotFoundParts" class="mt-2 p-2 bg-body-secondary rounded small" style="max-height: 150px; overflow-y: auto;">
                    <code *ngFor="let part of apiSyncResult.notFoundParts; let last = last">
                      {{ part }}{{ last ? '' : ', ' }}
                    </code>
                  </div>
                </div>
              </div>

              <div class="small text-muted mt-3">
                <div class="fw-medium text-body mb-1">What gets updated:</div>
                <ul class="mb-1 ps-3">
                  <li><strong>Qty Available</strong> - Current stock on hand</li>
                  <li><strong>Qty On Order</strong> - Quantity on order</li>
                  <li><strong>Description</strong> - Part description</li>
                </ul>
                <div class="small">
                  Pick counts, locations, and quantities needed are NOT affected. Parts are synced in batches of 30.
                </div>
              </div>
            </div>
          </div>

          <!-- Data Backup -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-database me-2"></i>Data Backup
              </span>
            </div>
            <div class="card-body">
              <p class="small text-muted mb-3">
                Export all application data to an Excel file for backup or migration purposes.
                Includes: Orders, Tools, Line Items, Picks, Issues, Parts Catalog, and BOM Templates.
              </p>

              <button
                class="btn btn-outline-primary w-100"
                [disabled]="exportingBackup"
                (click)="exportBackup()"
              >
                <i class="bi me-2" [class]="exportingBackup ? 'bi-arrow-clockwise spin' : 'bi-download'"></i>
                {{ exportingBackup ? 'Exporting...' : 'Export Full Backup' }}
              </button>

              <div *ngIf="backupExported" class="alert alert-success small mt-3 mb-0">
                <i class="bi bi-check-circle me-2"></i>
                Backup exported successfully!
              </div>
            </div>
          </div>

          <!-- Tips -->
          <div class="card">
            <div class="card-header">
              <span class="fw-semibold">
                <i class="bi bi-lightbulb me-2"></i>Tips
              </span>
            </div>
            <div class="card-body">
              <ul class="small text-muted mb-0">
                <li class="mb-2">Use the search bar to quickly find orders by SO#, PO#, or customer name</li>
                <li class="mb-2">Click on any order to view details and start picking</li>
                <li class="mb-2">The Dashboard shows orders that are due soon or overdue</li>
                <li class="mb-2">Import Excel files to quickly create orders with their parts lists</li>
                <li class="mb-2">Sync inventory regularly to keep stock quantities up to date</li>
                <li>Export backups periodically to prevent data loss</li>
              </ul>
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
  `]
})
export class SettingsComponent implements OnInit, OnDestroy {
  userName = '';
  theme: 'light' | 'dark' | 'system' = 'system';
  tagPrintingEnabled = false;

  // App status
  isOnline = navigator.onLine;
  offlineQueueCount = 0;
  isSyncing = false;
  canInstallPwa = false;
  private deferredPrompt: any = null;

  // Inventory sync
  inventoryFile: File | null = null;
  inventorySyncing = false;
  inventorySyncResult: InventorySyncResult | null = null;
  showNotFoundParts = false;

  // Part List sync
  partListFile: File | null = null;
  partListSyncing = false;
  partListSyncResult: PartListSyncResult | null = null;

  // API sync
  apiPassword = '';
  apiSyncing = false;
  apiProgress: ApiSyncProgress | null = null;
  apiSyncResult: ApiSyncResult | null = null;
  showApiNotFoundParts = false;
  private readonly API_SYNC_PASSWORD = '33214551';

  get isApiPasswordCorrect(): boolean {
    return this.apiPassword === this.API_SYNC_PASSWORD;
  }

  // Schema viewer
  showSchema = false;
  schemaCopied = false;
  readonly schemaSql = `-- Sales Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number TEXT NOT NULL UNIQUE,
  po_number TEXT,
  customer_name TEXT,
  order_date DATE,
  due_date DATE,
  estimated_ship_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'complete', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tools (units being built within an order)
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  tool_number TEXT NOT NULL,
  serial_number TEXT,
  tool_model TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'complete')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Line Items (parts to pick)
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  description TEXT,
  location TEXT,
  qty_per_unit INTEGER NOT NULL,
  total_qty_needed INTEGER NOT NULL,
  qty_available INTEGER,
  tool_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pick Records (actual picks - append-only for conflict-free sync)
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES line_items(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,
  qty_picked INTEGER NOT NULL,
  picked_by TEXT,
  notes TEXT,
  picked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (allow all for now - can be tightened later)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access (development)
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tools" ON tools FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE tools;
ALTER PUBLICATION supabase_realtime ADD TABLE line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tools_order_id ON tools(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_order_id ON line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_picks_line_item_id ON picks(line_item_id);
CREATE INDEX IF NOT EXISTS idx_picks_tool_id ON picks(tool_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_line_items_part_number ON line_items(part_number);`;

  // Backup
  exportingBackup = false;
  backupExported = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private settingsService: SettingsService,
    private inventorySyncService: InventorySyncService,
    private partListSyncService: PartListSyncService,
    private apiSyncService: ApiSyncService,
    private excelService: ExcelService,
    private offlineService: OfflineService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.settingsService.settings$.subscribe(settings => {
        this.userName = settings.user_name;
        this.theme = settings.theme;
        this.tagPrintingEnabled = settings.tagPrintingEnabled === true;
      }),
      this.offlineService.isOnline$.subscribe(online => {
        this.isOnline = online;
      }),
      this.offlineService.queue$.subscribe(queue => {
        this.offlineQueueCount = queue.length;
      }),
      this.offlineService.isSyncing$.subscribe(syncing => {
        this.isSyncing = syncing;
      }),
      this.inventorySyncService.syncing$.subscribe(syncing => {
        this.inventorySyncing = syncing;
      }),
      this.inventorySyncService.lastSyncResult$.subscribe(result => {
        this.inventorySyncResult = result;
      }),
      this.partListSyncService.syncing$.subscribe(syncing => {
        this.partListSyncing = syncing;
      }),
      this.partListSyncService.lastSyncResult$.subscribe(result => {
        this.partListSyncResult = result;
      }),
      this.apiSyncService.syncing$.subscribe(syncing => {
        this.apiSyncing = syncing;
      }),
      this.apiSyncService.progress$.subscribe(progress => {
        this.apiProgress = progress;
      }),
      this.apiSyncService.lastSyncResult$.subscribe(result => {
        this.apiSyncResult = result;
      })
    );

    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstallPwa = true;
    });

    // Listen for online/offline events
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  saveUserName(): void {
    this.settingsService.setUserName(this.userName);
  }

  saveTheme(): void {
    this.settingsService.setTheme(this.theme);
  }

  saveTagPrinting(): void {
    this.settingsService.setTagPrintingEnabled(this.tagPrintingEnabled);
  }

  // Inventory Sync
  onInventoryFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.inventoryFile = input.files[0];
      this.inventorySyncResult = null;
    }
  }

  async syncInventory(): Promise<void> {
    if (!this.inventoryFile) return;
    await this.inventorySyncService.syncInventory(this.inventoryFile);
  }

  // Part List Sync
  onPartListFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.partListFile = input.files[0];
      this.partListSyncResult = null;
    }
  }

  async syncPartList(): Promise<void> {
    if (!this.partListFile) return;
    await this.partListSyncService.syncPartList(this.partListFile);
  }

  // API Sync
  async syncFromApi(): Promise<void> {
    if (!this.isApiPasswordCorrect) return;
    await this.apiSyncService.syncFromApi();
  }

  // Backup Export
  async exportBackup(): Promise<void> {
    this.exportingBackup = true;
    this.backupExported = false;
    try {
      await this.excelService.exportFullBackupToExcel();
      this.backupExported = true;
      setTimeout(() => this.backupExported = false, 5000);
    } catch (error) {
      console.error('Failed to export backup:', error);
    } finally {
      this.exportingBackup = false;
    }
  }

  // Copy Schema
  async copySchema(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.schemaSql);
      this.schemaCopied = true;
      setTimeout(() => this.schemaCopied = false, 2000);
    } catch (err) {
      console.error('Failed to copy schema:', err);
    }
  }

  // Offline Queue Sync
  async syncOfflineQueue(): Promise<void> {
    // This would need to be connected to the picks service
    // For now, just show that the functionality exists
    console.log('Sync offline queue triggered');
  }

  // PWA Install
  async installPwa(): Promise<void> {
    if (!this.deferredPrompt) return;

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      this.canInstallPwa = false;
    }
    this.deferredPrompt = null;
  }
}
