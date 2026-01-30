import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OrdersService } from '../../services/orders.service';
import { ExcelService } from '../../services/excel.service';
import { PartsCatalogService } from '../../services/parts-catalog.service';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { ImportedOrder, ImportedLineItem, PartConflict, BOMTemplateWithItems } from '../../models';
import { TemplateSelectDialogComponent } from '../../components/dialogs/template-select-dialog.component';
import { DuplicatePartsDialogComponent } from '../../components/dialogs/duplicate-parts-dialog.component';

@Component({
  selector: 'app-import',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TemplateSelectDialogComponent, DuplicatePartsDialogComponent],
  template: `
    <div>
      <div class="mb-4">
        <h1 class="h3 fw-bold mb-1">Import Order</h1>
        <p class="text-muted mb-0">Upload an Excel or CSV file to import a sales order</p>
      </div>

      <!-- Drop Zone -->
      <div class="card mb-4" *ngIf="!parseResult">
        <div class="card-body">
          <div class="dropzone"
               [class.dragover]="isDragging"
               (drop)="onDrop($event)"
               (dragover)="onDragOver($event)"
               (dragleave)="onDragLeave($event)">
            <i class="bi bi-upload display-4 text-muted mb-3"></i>
            <p class="h5 mb-2">Drag and drop your file here</p>
            <p class="text-muted mb-4">Supports Excel (.xlsx) and CSV files</p>
            <div class="d-flex justify-content-center gap-2 flex-wrap">
              <label class="btn btn-primary">
                <i class="bi bi-file-earmark-spreadsheet me-1"></i>
                Browse Files
                <input type="file" class="d-none" accept=".xlsx,.xls,.csv" (change)="onFileSelect($event)">
              </label>
              <button class="btn btn-outline-secondary" (click)="showTemplateDialog = true">
                <i class="bi bi-file-earmark-text me-1"></i>
                Load from Template
              </button>
            </div>
          </div>

          <!-- Parse Errors -->
          <div class="alert alert-danger mt-4" *ngIf="parseErrors.length > 0">
            <div class="d-flex align-items-center mb-2">
              <i class="bi bi-exclamation-circle me-2"></i>
              <strong>Import Failed</strong>
            </div>
            <ul class="mb-0 ps-3">
              <li *ngFor="let error of parseErrors">{{ error }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="card mb-4" *ngIf="parseResult">
        <div class="card-header d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <i class="bi bi-check-circle-fill text-success me-2"></i>
            <span class="fw-semibold">Preview: SO-{{ parseResult.order.so_number }}</span>
            <span *ngIf="loadedFromTemplate" class="badge bg-info ms-2">From Template</span>
          </div>
          <button class="btn btn-sm btn-outline-secondary" (click)="clearResult()">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="card-body">
          <!-- Warnings -->
          <div class="alert alert-warning" *ngIf="parseResult.warnings.length > 0">
            <strong>Warnings</strong>
            <ul class="mb-0 ps-3">
              <li *ngFor="let warning of parseResult.warnings">{{ warning }}</li>
            </ul>
          </div>

          <!-- Conflicts detected -->
          <div class="alert alert-warning d-flex align-items-center justify-content-between" *ngIf="partConflicts.length > 0">
            <div>
              <i class="bi bi-exclamation-triangle me-2"></i>
              <strong>{{ partConflicts.length }} part(s)</strong> have different values than the Parts Catalog.
            </div>
            <button class="btn btn-sm btn-warning" (click)="showDuplicatesDialog = true">
              Review Conflicts
            </button>
          </div>

          <!-- Order Info -->
          <div class="mb-4">
            <h6 class="fw-semibold mb-2">Order Details</h6>
            <div class="row g-3 small">
              <div class="col-6 col-md-3">
                <label class="form-label text-muted small mb-1">SO Number *</label>
                <input type="text" class="form-control form-control-sm" [(ngModel)]="parseResult.order.so_number">
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label text-muted small mb-1">PO Number</label>
                <input type="text" class="form-control form-control-sm" [(ngModel)]="parseResult.order.po_number">
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label text-muted small mb-1">Customer</label>
                <input type="text" class="form-control form-control-sm" [(ngModel)]="parseResult.order.customer_name">
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label text-muted small mb-1">Due Date</label>
                <input type="date" class="form-control form-control-sm" [(ngModel)]="parseResult.order.due_date">
              </div>
            </div>
          </div>

          <!-- Tools -->
          <div class="mb-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="fw-semibold mb-0">Tools ({{ parseResult.order.tools.length }})</h6>
              <div class="d-flex align-items-center gap-2">
                <label class="form-label mb-0 small text-muted">Tool Count:</label>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  style="width: 70px;"
                  [(ngModel)]="toolCount"
                  [min]="1"
                  (change)="regenerateTools()"
                >
              </div>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <span *ngFor="let tool of parseResult.order.tools" class="badge bg-secondary">
                {{ tool.tool_number }}
                <span *ngIf="tool.tool_model"> [{{ tool.tool_model }}]</span>
              </span>
            </div>
          </div>

          <!-- Line Items -->
          <div class="mb-4">
            <h6 class="fw-semibold mb-2">Line Items ({{ parseResult.order.line_items.length }})</h6>
            <div class="table-responsive border rounded" style="max-height: 300px; overflow-y: auto;">
              <table class="table table-sm mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>Part Number</th>
                    <th>Description</th>
                    <th>Location</th>
                    <th class="text-center">Qty/Unit</th>
                    <th class="text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let item of parseResult.order.line_items.slice(0, 50)">
                    <td class="font-mono">{{ item.part_number }}</td>
                    <td class="text-muted">{{ item.description || '-' }}</td>
                    <td>{{ item.location || '-' }}</td>
                    <td class="text-center">{{ item.qty_per_unit }}</td>
                    <td class="text-center">{{ item.total_qty_needed }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="small text-muted text-center mt-2" *ngIf="parseResult.order.line_items.length > 50">
              ...and {{ parseResult.order.line_items.length - 50 }} more items
            </p>
          </div>

          <!-- Import Options -->
          <div class="mb-4 p-3 bg-light rounded">
            <h6 class="fw-semibold mb-2">Import Options</h6>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="saveToCatalog" [(ngModel)]="saveToCatalog">
              <label class="form-check-label" for="saveToCatalog">
                Save new parts to Parts Catalog
                <span class="text-muted small d-block">Parts not already in the catalog will be added automatically</span>
              </label>
            </div>
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="useLegacyFormat" [(ngModel)]="useLegacyFormat"
                     (change)="reparse()">
              <label class="form-check-label" for="useLegacyFormat">
                Legacy format (tool columns)
                <span class="text-muted small d-block">Enable if your file has columns like "3137-1", "3137-2" for per-tool quantities</span>
              </label>
            </div>
          </div>

          <!-- Actions -->
          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-outline-secondary" (click)="clearResult()">Cancel</button>
            <button class="btn btn-primary" (click)="handleImport()" [disabled]="isImporting || !parseResult.order.so_number">
              <i class="bi me-1" [class]="isImporting ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
              {{ isImporting ? 'Importing...' : 'Import Order' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Template Download -->
      <div class="card mb-4">
        <div class="card-header">
          <span class="fw-semibold">Download Template</span>
        </div>
        <div class="card-body">
          <p class="small text-muted mb-3">Download an Excel template to get started:</p>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-outline-secondary" (click)="downloadTemplate('single')">
              <i class="bi bi-download me-1"></i> Single Tool Type
            </button>
            <button class="btn btn-outline-secondary" (click)="downloadTemplate('multi')">
              <i class="bi bi-download me-1"></i> Multiple Tool Types
            </button>
          </div>
          <p class="small text-muted mt-3 mb-0">
            <strong>Single Tool Type:</strong> All tools share the same parts list.<br>
            <strong>Multiple Tool Types:</strong> Different tools have different BOMs.
          </p>
        </div>
      </div>

      <!-- Help -->
      <div class="card">
        <div class="card-header">
          <span class="fw-semibold">File Format Guide</span>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <h6 class="fw-semibold">Single Tool Type (Simple Format)</h6>
            <p class="small text-muted mb-0">
              Excel file with "Order Info" sheet containing SO Number, PO Number, Customer, Tool Qty, Tool Model.
              "Parts" sheet with Part Number, Description, Location, Qty/Unit columns.
            </p>
          </div>
          <div class="mb-3">
            <h6 class="fw-semibold">Legacy Format (Tool Columns)</h6>
            <p class="small text-muted mb-0">
              Excel file with columns named like "3137-1", "3137-2" for per-tool quantities.
              Enable "Legacy format" option to use this format.
            </p>
          </div>
          <div class="mb-3">
            <h6 class="fw-semibold">Expected Columns</h6>
            <ul class="small text-muted mb-0">
              <li>Part Number (required)</li>
              <li>Description (optional)</li>
              <li>Location/Bin (optional)</li>
              <li>Quantity per unit or tool-specific quantities</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Template Select Dialog -->
      <app-template-select-dialog
        [(show)]="showTemplateDialog"
        (templateSelected)="handleTemplateSelected($event)"
      ></app-template-select-dialog>

      <!-- Duplicate Parts Dialog -->
      <app-duplicate-parts-dialog
        [(show)]="showDuplicatesDialog"
        [conflicts]="partConflicts"
        (resolved)="handleConflictsResolved($event)"
      ></app-duplicate-parts-dialog>
    </div>
  `,
  styles: [`
    .dropzone {
      border: 2px dashed #dee2e6;
      border-radius: 0.5rem;
      padding: 3rem;
      text-align: center;
      transition: all 0.2s ease;
    }

    .dropzone.dragover {
      border-color: #0d6efd;
      background-color: rgba(13, 110, 253, 0.05);
    }

    .dropzone:hover {
      border-color: #adb5bd;
    }

    .font-mono {
      font-family: monospace;
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .sticky-top {
      position: sticky;
      top: 0;
      z-index: 1;
    }
  `]
})
export class ImportComponent implements OnInit, OnDestroy {
  isDragging = false;
  parseResult: {
    order: ImportedOrder;
    errors: string[];
    warnings: string[];
  } | null = null;
  parseErrors: string[] = [];
  isImporting = false;
  loadedFromTemplate = false;

  // Dialogs
  showTemplateDialog = false;
  showDuplicatesDialog = false;

  // Conflicts
  partConflicts: PartConflict[] = [];

  // Import options
  saveToCatalog = true;
  useLegacyFormat = false;
  toolCount = 1;

  // File reference for re-parsing
  private currentFile: File | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private ordersService: OrdersService,
    private excelService: ExcelService,
    private partsCatalogService: PartsCatalogService,
    private bomTemplatesService: BomTemplatesService
  ) {}

  ngOnInit(): void {
    // Preload parts catalog for conflict detection
    this.partsCatalogService.fetchParts();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.handleFile(file);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.handleFile(file);
    }
  }

  async handleFile(file: File): Promise<void> {
    this.parseResult = null;
    this.parseErrors = [];
    this.partConflicts = [];
    this.loadedFromTemplate = false;
    this.currentFile = file;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheet');
    const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';

    if (!isExcel && !isCsv) {
      this.parseErrors = ['Please upload an Excel (.xlsx) or CSV file'];
      return;
    }

    let result;
    if (isExcel) {
      result = this.useLegacyFormat
        ? await this.excelService.parseEnhancedExcelFileWithLegacySupport(file)
        : await this.excelService.parseEnhancedExcelFile(file);
    } else {
      result = await this.excelService.parseCsvFile(file);
    }

    if (result.success && result.order) {
      this.parseResult = {
        order: result.order,
        errors: result.errors,
        warnings: result.warnings,
      };
      this.toolCount = result.order.tools.length;

      // Check for conflicts with parts catalog
      this.checkForConflicts(result.order.line_items);
    } else {
      this.parseErrors = result.errors;
    }
  }

  async reparse(): Promise<void> {
    if (this.currentFile) {
      await this.handleFile(this.currentFile);
    }
  }

  checkForConflicts(lineItems: ImportedLineItem[]): void {
    this.partConflicts = this.partsCatalogService.checkForConflicts(lineItems);
  }

  regenerateTools(): void {
    if (!this.parseResult) return;

    const soNumber = this.parseResult.order.so_number;
    const toolModel = this.parseResult.order.tools[0]?.tool_model;
    const count = Math.max(1, this.toolCount);

    this.parseResult.order.tools = [];
    for (let i = 1; i <= count; i++) {
      this.parseResult.order.tools.push({
        tool_number: `${soNumber}-${i}`,
        tool_model: toolModel,
      });
    }

    // Recalculate total_qty_needed for all line items
    for (const item of this.parseResult.order.line_items) {
      item.total_qty_needed = item.qty_per_unit * count;
    }
  }

  handleTemplateSelected(template: BOMTemplateWithItems): void {
    // Create a new order from the template
    const order: ImportedOrder = {
      so_number: '',
      tools: [{
        tool_number: '-1',
        tool_model: template.tool_model || undefined,
      }],
      line_items: template.items.map(item => ({
        part_number: item.part_number,
        description: item.description || undefined,
        location: item.location || undefined,
        qty_per_unit: item.qty_per_unit,
        total_qty_needed: item.qty_per_unit,
      })),
    };

    this.parseResult = {
      order,
      errors: [],
      warnings: [`Loaded from template: ${template.name}`],
    };
    this.loadedFromTemplate = true;
    this.toolCount = 1;
    this.currentFile = null;

    // Check for conflicts
    this.checkForConflicts(order.line_items);
  }

  async handleConflictsResolved(conflicts: PartConflict[]): Promise<void> {
    // Apply resolutions to the parts catalog
    await this.partsCatalogService.applyConflictResolutions(conflicts);

    // Clear conflicts
    this.partConflicts = [];
  }

  async handleImport(): Promise<void> {
    if (!this.parseResult?.order) return;

    this.isImporting = true;

    // Save new parts to catalog if enabled
    if (this.saveToCatalog) {
      await this.partsCatalogService.savePartsFromImport(
        this.parseResult.order.line_items,
        true // Skip existing parts
      );
    }

    // Import the order
    const result = await this.ordersService.importOrder(this.parseResult.order);
    this.isImporting = false;

    if (result) {
      this.router.navigate(['/orders', result.id]);
    }
  }

  clearResult(): void {
    this.parseResult = null;
    this.parseErrors = [];
    this.partConflicts = [];
    this.loadedFromTemplate = false;
    this.currentFile = null;
  }

  downloadTemplate(type: 'single' | 'multi'): void {
    this.excelService.downloadImportTemplate(type);
  }
}
