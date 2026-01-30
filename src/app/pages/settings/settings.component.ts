import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { InventorySyncService, SyncResult as InventorySyncResult } from '../../services/inventory-sync.service';
import { PartListSyncService, SyncResult as PartListSyncResult } from '../../services/part-list-sync.service';
import { ExcelService } from '../../services/excel.service';
import { OfflineService } from '../../services/offline.service';
import { UserSettings } from '../../models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div>
      <div class="mb-4">
        <h1 class="h3 fw-bold mb-1">Settings</h1>
        <p class="text-muted mb-0">Configure your preferences and manage data</p>
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
              <p class="mb-2"><strong>Tool Pick List Tracker</strong></p>
              <p class="text-muted small mb-2">
                A comprehensive application for managing pick lists and tracking picking progress for sales orders.
              </p>
              <p class="text-muted small mb-0">
                Built with Angular and Bootstrap. Data stored in Supabase.
              </p>
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
                  <div *ngIf="showNotFoundParts" class="mt-2 p-2 bg-light rounded small" style="max-height: 150px; overflow-y: auto;">
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

  // Backup
  exportingBackup = false;
  backupExported = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private settingsService: SettingsService,
    private inventorySyncService: InventorySyncService,
    private partListSyncService: PartListSyncService,
    private excelService: ExcelService,
    private offlineService: OfflineService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.settingsService.settings$.subscribe(settings => {
        this.userName = settings.user_name;
        this.theme = settings.theme;
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
