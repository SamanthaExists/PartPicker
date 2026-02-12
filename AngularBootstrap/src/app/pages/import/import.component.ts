import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OrdersService } from '../../services/orders.service';
import { ExcelService } from '../../services/excel.service';
import { PartsCatalogService } from '../../services/parts-catalog.service';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { BomParserService, ParsedBOM, ToolMapping, MergedBOMResult } from '../../services/bom-parser.service';
import { ActivityLogService } from '../../services/activity-log.service';
import { SettingsService } from '../../services/settings.service';
import { PartsService } from '../../services/parts.service';
import { PartRelationshipsService } from '../../services/part-relationships.service';
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

      <!-- Unclassified Parts Alert -->
      <div class="alert alert-warning alert-dismissible fade show d-flex align-items-center justify-content-between"
           *ngIf="showUnclassifiedAlert && unclassifiedPartsCount > 0">
        <div class="d-flex align-items-start">
          <i class="bi bi-tag me-2"></i>
          <div>
            <strong>Unclassified Parts Found</strong>
            <div>{{ unclassifiedPartsCount }} part{{ unclassifiedPartsCount !== 1 ? 's' : '' }}
                 {{ unclassifiedPartsCount !== 1 ? 'were' : 'was' }} imported without classification.</div>
          </div>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-warning" (click)="navigateToClassifyParts()">
            Classify Now
          </button>
          <button type="button" class="btn-close" (click)="showUnclassifiedAlert = false"></button>
        </div>
      </div>

      <!-- Tabs -->
      <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'standard'" (click)="activeTab = 'standard'" role="button">
            <i class="bi bi-file-earmark-spreadsheet me-1"></i> Standard Import
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" [class.active]="activeTab === 'multi-bom'" (click)="activeTab = 'multi-bom'" role="button">
            <i class="bi bi-files me-1"></i> Multi-BOM Import
          </a>
        </li>
      </ul>

      <!-- ======================== STANDARD IMPORT TAB ======================== -->
      <div *ngIf="activeTab === 'standard'">

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
                <thead class="table-secondary sticky-top">
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
          <div class="mb-4 p-3 bg-body-secondary rounded">
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
            <button class="btn btn-outline-secondary" (click)="downloadTemplate('single-bom')">
              <i class="bi bi-download me-1"></i> Single Tool Type (BOM)
            </button>
            <button class="btn btn-outline-secondary" (click)="downloadTemplate('multi')">
              <i class="bi bi-download me-1"></i> Multiple Tool Types (BOM)
            </button>
          </div>
          <p class="small text-muted mt-3 mb-0">
            <strong>Single Tool Type:</strong> All tools share the same parts list (flat).<br>
            <strong>Single Tool Type (BOM):</strong> Multi-level BOM with hierarchy (includes Level column).<br>
            <strong>Multiple Tool Types (BOM):</strong> Each tool has its own hierarchical BOM (includes Level column).
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

      </div><!-- end standard tab -->

      <!-- ======================== MULTI-BOM IMPORT TAB ======================== -->
      <div *ngIf="activeTab === 'multi-bom'">
        <div *ngIf="!bomParseResult">
          <!-- Order Info Form -->
          <div class="card mb-4">
            <div class="card-header"><span class="fw-semibold">Order Information</span></div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">SO Number *</label>
                  <input type="text" class="form-control form-control-sm" placeholder="e.g., 3930"
                         [(ngModel)]="bomOrderInfo.soNumber" (input)="handleBomSoNumberChange()">
                </div>
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">PO Number</label>
                  <input type="text" class="form-control form-control-sm" placeholder="Optional"
                         [(ngModel)]="bomOrderInfo.poNumber">
                </div>
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">Customer Name</label>
                  <input type="text" class="form-control form-control-sm" placeholder="e.g., Sonovision"
                         [(ngModel)]="bomOrderInfo.customerName">
                </div>
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">Purchase Date</label>
                  <input type="date" class="form-control form-control-sm" [(ngModel)]="bomOrderInfo.purchaseDate">
                </div>
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">Due Date</label>
                  <input type="date" class="form-control form-control-sm" [(ngModel)]="bomOrderInfo.dueDate">
                </div>
                <div class="col-sm-6 col-lg-4">
                  <label class="form-label small">Est. Ship Date</label>
                  <input type="date" class="form-control form-control-sm" [(ngModel)]="bomOrderInfo.estimatedShipDate">
                </div>
              </div>
            </div>
          </div>

          <!-- BOM File Upload -->
          <div class="card mb-4">
            <div class="card-header"><span class="fw-semibold">BOM Files</span></div>
            <div class="card-body">
              <div class="dropzone" [class.dragover]="isBomDragging"
                   (drop)="onBomDrop($event)" (dragover)="onBomDragOver($event)" (dragleave)="onBomDragLeave($event)">
                <i class="bi bi-files display-4 text-muted mb-3"></i>
                <p class="h5 mb-1">Drop BOM CSV files here</p>
                <p class="text-muted small mb-3">One CSV per tool variation (e.g., 230QR-10002.csv, 230QR-10003.csv)</p>
                <label class="btn btn-outline-secondary">
                  <i class="bi bi-upload me-1"></i> Browse CSV Files
                  <input type="file" class="d-none" accept=".csv" multiple (change)="onBomFileSelect($event)">
                </label>
              </div>

              <!-- File List -->
              <div class="mt-3" *ngIf="bomFiles.length > 0">
                <h6 class="small fw-semibold mb-2">Uploaded Files ({{ bomFiles.length }})</h6>
                <div *ngFor="let entry of bomFiles; let i = index"
                     class="d-flex align-items-center justify-content-between p-3 bg-body-secondary rounded mb-1">
                  <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-file-earmark-text text-muted"></i>
                    <div>
                      <span class="font-mono small">{{ entry.toolModel }}</span>
                      <small class="text-muted d-block">Tool: {{ entry.toolNumber }}</small>
                    </div>
                  </div>
                  <button class="btn btn-sm btn-outline-secondary" (click)="removeBomFile(i)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>

              <!-- Parse Errors -->
              <div class="alert alert-danger mt-3" *ngIf="bomParseErrors.length > 0">
                <div class="d-flex align-items-center mb-2">
                  <i class="bi bi-exclamation-circle me-2"></i>
                  <strong>Parse Failed</strong>
                </div>
                <ul class="mb-0 ps-3">
                  <li *ngFor="let error of bomParseErrors">{{ error }}</li>
                </ul>
              </div>

              <!-- Parse Button -->
              <div class="d-flex justify-content-end mt-3" *ngIf="bomFiles.length > 0">
                <button class="btn btn-primary" (click)="handleParseBOMs()">Parse &amp; Preview</button>
              </div>
            </div>
          </div>

          <!-- Multi-BOM Help -->
          <div class="card">
            <div class="card-header"><span class="fw-semibold">Multi-BOM Format Guide</span></div>
            <div class="card-body">
              <p class="small text-muted">Use this mode when each tool has its own multi-level BOM (e.g., Sonovision orders where tools are variations of each other).</p>
              <div class="mb-3">
                <h6 class="fw-semibold">Expected CSV Format</h6>
                <ul class="small text-muted">
                  <li>Columns: Level, Part Number, Type, Qty, Description</li>
                  <li>Multi-level hierarchy (Level 0 = root, Level 1 = top assembly, etc.)</li>
                  <li>Only leaf parts (no sub-components) are extracted for picking</li>
                  <li>Quantities are multiplied through the hierarchy</li>
                </ul>
              </div>
              <div>
                <h6 class="fw-semibold">How Merging Works</h6>
                <ul class="small text-muted mb-0">
                  <li>Parts shared across all BOMs at the same qty become shared line items</li>
                  <li>Parts unique to specific tools become tool-specific line items</li>
                  <li>Descriptions and locations are auto-filled from your Parts Catalog</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Multi-BOM Preview -->
        <div class="card" *ngIf="bomParseResult">
          <div class="card-header d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center">
              <i class="bi bi-check-circle-fill text-success me-2"></i>
              <span class="fw-semibold">Preview: SO-{{ bomOrderInfo.soNumber }}</span>
            </div>
            <button class="btn btn-sm btn-outline-secondary" (click)="clearBomResult()"><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="card-body">
            <!-- Warnings -->
            <div class="alert alert-warning" *ngIf="bomParseResult.warnings.length > 0">
              <strong>Warnings</strong>
              <ul class="mb-0 ps-3">
                <li *ngFor="let warning of bomParseResult.warnings">{{ warning }}</li>
              </ul>
            </div>

            <!-- Summary Stats -->
            <div class="row g-3 mb-4">
              <div class="col-4">
                <div class="p-3 bg-body-secondary rounded text-center">
                  <div class="h4 fw-bold mb-0">{{ bomParseResult.merged.stats.totalParts }}</div>
                  <small class="text-muted">Total Parts</small>
                </div>
              </div>
              <div class="col-4">
                <div class="p-3 rounded text-center" style="background-color: rgba(25, 135, 84, 0.1);">
                  <div class="h4 fw-bold mb-0 text-success">{{ bomParseResult.merged.stats.sharedCount }}</div>
                  <small class="text-muted">Shared</small>
                </div>
              </div>
              <div class="col-4">
                <div class="p-3 rounded text-center" style="background-color: rgba(13, 110, 253, 0.1);">
                  <div class="h4 fw-bold mb-0 text-primary">{{ bomParseResult.merged.stats.toolSpecificCount }}</div>
                  <small class="text-muted">Tool-Specific</small>
                </div>
              </div>
            </div>

            <!-- Tools -->
            <div class="mb-4">
              <h6 class="fw-semibold mb-2">Tools ({{ bomParseResult.order.tools.length }})</h6>
              <div class="d-flex flex-wrap gap-2">
                <span *ngFor="let tool of bomParseResult.order.tools" class="badge bg-secondary">
                  {{ tool.tool_number }}
                  <span *ngIf="tool.tool_model"> [{{ tool.tool_model }}]</span>
                </span>
              </div>
            </div>

            <!-- Conflicts Warning -->
            <div class="alert alert-warning d-flex align-items-center justify-content-between" *ngIf="partConflicts.length > 0">
              <div>
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>{{ partConflicts.length }} part(s)</strong> have different values than the Parts Catalog.
              </div>
              <button class="btn btn-sm btn-warning" (click)="showDuplicatesDialog = true">Review Conflicts</button>
            </div>

            <!-- Line Items Preview -->
            <div class="mb-4">
              <h6 class="fw-semibold mb-2">Line Items ({{ bomParseResult.order.line_items.length }})</h6>
              <div class="table-responsive border rounded" style="max-height: 400px; overflow-y: auto;">
                <table class="table table-sm mb-0">
                  <thead class="table-secondary sticky-top">
                    <tr>
                      <th>Part Number</th>
                      <th>Description</th>
                      <th>Assembly</th>
                      <th class="text-center">Scope</th>
                      <th class="text-center">Qty/Unit</th>
                      <th class="text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let mergedItem of bomParseResult.merged.lineItems.slice(0, 100); let i = index">
                      <td class="font-mono">{{ mergedItem.partNumber }}</td>
                      <td class="text-muted">{{ bomParseResult.order.line_items[i].description || mergedItem.description || '-' }}</td>
                      <td class="font-mono small text-muted">{{ mergedItem.assemblyGroup || '-' }}</td>
                      <td class="text-center">
                        <span *ngIf="mergedItem.isShared" class="badge bg-success-subtle text-success border border-success">Shared</span>
                        <span *ngIf="!mergedItem.isShared" class="badge bg-primary-subtle text-primary border border-primary">
                          {{ mergedItem.toolModels.length }} tool{{ mergedItem.toolModels.length !== 1 ? 's' : '' }}
                        </span>
                      </td>
                      <td class="text-center">{{ mergedItem.qtyPerUnit }}</td>
                      <td class="text-center">{{ bomParseResult.order.line_items[i].total_qty_needed || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="small text-muted text-center mt-2" *ngIf="bomParseResult.merged.lineItems.length > 100">
                ...and {{ bomParseResult.merged.lineItems.length - 100 }} more items
              </p>
            </div>

            <!-- Options -->
            <div class="mb-4 p-3 bg-body-secondary rounded">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="bomSaveToCatalog" [(ngModel)]="saveToCatalog">
                <label class="form-check-label" for="bomSaveToCatalog">Save new parts to Parts Catalog</label>
              </div>
            </div>

            <!-- Actions -->
            <div class="d-flex justify-content-end gap-2">
              <button class="btn btn-outline-secondary" (click)="clearBomResult()">Cancel</button>
              <button class="btn btn-primary" (click)="handleBomImport()" [disabled]="isImporting">
                <i class="bi me-1" [class]="isImporting ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
                {{ isImporting ? 'Importing...' : 'Import Order' }}
              </button>
            </div>
          </div>
        </div>
      </div><!-- end multi-bom tab -->

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
      border: 2px dashed var(--bs-border-color);
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
      border-color: var(--bs-secondary-color);
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

  // Unclassified notification
  unclassifiedPartsCount = 0;
  showUnclassifiedAlert = false;

  // File reference for re-parsing
  private currentFile: File | null = null;

  private subscriptions: Subscription[] = [];

  // Multi-BOM tab state
  activeTab: 'standard' | 'multi-bom' = 'standard';
  isBomDragging = false;
  bomFiles: { file: File; toolModel: string; toolNumber: string }[] = [];
  bomOrderInfo = {
    soNumber: '',
    poNumber: '',
    customerName: '',
    purchaseDate: '',
    dueDate: '',
    estimatedShipDate: '',
  };
  bomParseResult: {
    merged: MergedBOMResult;
    order: ImportedOrder;
    warnings: string[];
  } | null = null;
  bomParseErrors: string[] = [];

  constructor(
    private router: Router,
    private ordersService: OrdersService,
    private excelService: ExcelService,
    private partsCatalogService: PartsCatalogService,
    private bomTemplatesService: BomTemplatesService,
    private bomParserService: BomParserService,
    private activityLogService: ActivityLogService,
    private settingsService: SettingsService,
    private partsService: PartsService,
    private partRelationshipsService: PartRelationshipsService
  ) {}

  ngOnInit(): void {
    // Preload parts catalog for conflict detection
    this.partsCatalogService.fetchParts();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  navigateToClassifyParts(): void {
    this.router.navigate(['/parts'], { queryParams: { filter: 'unclassified' } });
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

    try {
      // Process parts with classification and assembly relationships
      let unclassifiedCount = 0;
      if (this.saveToCatalog) {
        const processResult = await this.processPartsAndRelationships(this.parseResult.order.line_items);
        unclassifiedCount = processResult.unclassifiedCount;
      }

      // Import the order
      const result = await this.ordersService.importOrder(this.parseResult.order);

      if (result) {
        const toolNumbers = this.parseResult.order.tools.map(t => t.tool_number);
        await this.activityLogService.logActivity({
          type: 'order_imported',
          order_id: result.id,
          so_number: this.parseResult.order.so_number,
          description: `Order SO-${this.parseResult.order.so_number} imported with ${this.parseResult.order.line_items.length} parts and ${this.parseResult.order.tools.length} tools`,
          performed_by: this.settingsService.getUserName(),
          details: {
            part_count: this.parseResult.order.line_items.length,
            tool_count: this.parseResult.order.tools.length,
            tool_numbers: toolNumbers,
          },
        });

        // Auto-extract template
        const toolModel = this.parseResult.order.tools[0]?.tool_model || null;
        await this.bomTemplatesService.autoExtractTemplate(this.parseResult.order.line_items, toolModel, this.parseResult.order.so_number);

        // Show unclassified parts notification if needed
        if (unclassifiedCount > 0) {
          this.unclassifiedPartsCount = unclassifiedCount;
          this.showUnclassifiedAlert = true;
          // Auto-dismiss after 2 seconds
          setTimeout(() => {
            this.showUnclassifiedAlert = false;
          }, 2000);
        }

        this.router.navigate(['/orders', result.id]);
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      this.isImporting = false;
    }
  }

  /**
   * Process imported line items to create/update parts with classifications
   * and set up assembly relationships based on assembly_group
   */
  private async processPartsAndRelationships(lineItems: ImportedLineItem[]): Promise<{ unclassifiedCount: number; warnings: string[] }> {
    const warnings: string[] = [];
    let unclassifiedCount = 0;

    // Step 1: Create/update all parts with classifications
    const partMap = new Map<string, string>(); // part_number -> part_id

    for (const item of lineItems) {
      const part = await this.partsService.findOrCreatePart(
        item.part_number,
        item.description,
        item.location,
        item.classification_type || null
      );
      partMap.set(item.part_number, part.id);

      if (!part.classification_type) {
        unclassifiedCount++;
      }
    }

    // Step 2: Group by assembly_group and create relationships
    const assemblyGroups = new Map<string, ImportedLineItem[]>();

    for (const item of lineItems) {
      if (item.assembly_group) {
        const group = assemblyGroups.get(item.assembly_group) || [];
        group.push(item);
        assemblyGroups.set(item.assembly_group, group);
      }
    }

    // Step 3: For each assembly group, create parent assembly and relationships
    for (const [assemblyName, members] of assemblyGroups) {
      try {
        // Create/update the assembly part itself
        const assemblyPart = await this.partsService.findOrCreatePart(
          assemblyName,
          `Assembly: ${assemblyName}`,
          null,
          'assembly'
        );

        // Create relationships for all component parts
        const relationships = members
          .filter(m => m.part_number !== assemblyName) // Don't link assembly to itself
          .map(m => ({
            childId: partMap.get(m.part_number)!,
            quantity: m.qty_per_unit,
          }))
          .filter(r => r.childId); // Only include parts that were successfully created

        if (relationships.length > 0) {
          await this.partRelationshipsService.bulkCreateRelationships(assemblyPart.id, relationships, {
            skipCircularCheck: true, // Skip for performance during bulk import
          });
        }
      } catch (error) {
        console.error(`Failed to create assembly relationships for ${assemblyName}:`, error);
        warnings.push(`Could not link assembly "${assemblyName}"`);
      }
    }

    return { unclassifiedCount, warnings };
  }

  clearResult(): void {
    this.parseResult = null;
    this.parseErrors = [];
    this.partConflicts = [];
    this.loadedFromTemplate = false;
    this.currentFile = null;
  }

  async downloadTemplate(type: 'single' | 'multi' | 'single-bom'): Promise<void> {
    await this.excelService.downloadImportTemplate(type);
  }

  // ===================== Multi-BOM Methods =====================

  handleBomSoNumberChange(): void {
    // Update tool numbers when SO number changes
    for (const entry of this.bomFiles) {
      entry.toolNumber = this.bomOrderInfo.soNumber
        ? `${this.bomOrderInfo.soNumber}-${entry.toolModel}`
        : entry.toolModel;
    }
  }

  onBomDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isBomDragging = true;
  }

  onBomDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isBomDragging = false;
  }

  onBomDrop(event: DragEvent): void {
    event.preventDefault();
    this.isBomDragging = false;
    const files = event.dataTransfer?.files;
    if (files) {
      this.addBomFiles(Array.from(files));
    }
  }

  onBomFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addBomFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private addBomFiles(files: File[]): void {
    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue;
      const toolModel = file.name.replace(/\.csv$/i, '').trim();
      const toolNumber = this.bomOrderInfo.soNumber
        ? `${this.bomOrderInfo.soNumber}-${toolModel}`
        : toolModel;
      // Avoid duplicates
      if (!this.bomFiles.some(f => f.toolModel === toolModel)) {
        this.bomFiles.push({ file, toolModel, toolNumber });
      }
    }
  }

  removeBomFile(index: number): void {
    this.bomFiles.splice(index, 1);
  }

  async handleParseBOMs(): Promise<void> {
    this.bomParseErrors = [];
    this.bomParseResult = null;

    if (!this.bomOrderInfo.soNumber) {
      this.bomParseErrors = ['SO Number is required'];
      return;
    }

    if (this.bomFiles.length === 0) {
      this.bomParseErrors = ['Please add at least one BOM file'];
      return;
    }

    const allWarnings: string[] = [];
    const parsedBOMs: ParsedBOM[] = [];

    for (const entry of this.bomFiles) {
      const text = await entry.file.text();
      const parsed = this.bomParserService.parseBOMCsv(text, entry.file.name);
      allWarnings.push(...parsed.warnings);
      if (parsed.leafParts.length === 0) {
        this.bomParseErrors.push(`No parts found in ${entry.file.name}`);
      }
      parsedBOMs.push(parsed);
    }

    if (this.bomParseErrors.length > 0) return;

    const toolMappings: ToolMapping[] = this.bomFiles.map(entry => ({
      toolModel: entry.toolModel,
      toolNumber: entry.toolNumber,
    }));

    // Get catalog parts for description/location enrichment
    const catalogParts = this.partsCatalogService.getCurrentParts();

    const merged = this.bomParserService.mergeMultipleBOMs(parsedBOMs, toolMappings);
    const order = await this.bomParserService.buildImportedOrder(
      merged,
      {
        soNumber: this.bomOrderInfo.soNumber,
        poNumber: this.bomOrderInfo.poNumber || undefined,
        customerName: this.bomOrderInfo.customerName || undefined,
        purchaseDate: this.bomOrderInfo.purchaseDate || undefined,
        dueDate: this.bomOrderInfo.dueDate || undefined,
        estimatedShipDate: this.bomOrderInfo.estimatedShipDate || undefined,
      },
      toolMappings,
      catalogParts
    );

    this.bomParseResult = { merged, order, warnings: allWarnings };

    // Check for catalog conflicts
    this.checkForConflicts(order.line_items);
  }

  async handleBomImport(): Promise<void> {
    if (!this.bomParseResult?.order) return;

    this.isImporting = true;

    try {
      // Process parts with classification and assembly relationships
      let unclassifiedCount = 0;
      if (this.saveToCatalog) {
        const processResult = await this.processPartsAndRelationships(this.bomParseResult.order.line_items);
        unclassifiedCount = processResult.unclassifiedCount;
      }

      const result = await this.ordersService.importOrder(this.bomParseResult.order);

      if (result) {
        const toolNumbers = this.bomParseResult.order.tools.map(t => t.tool_number);
        await this.activityLogService.logActivity({
          type: 'order_imported',
          order_id: result.id,
          so_number: this.bomParseResult.order.so_number,
          description: `Order SO-${this.bomParseResult.order.so_number} imported with ${this.bomParseResult.order.line_items.length} parts and ${this.bomParseResult.order.tools.length} tools`,
          performed_by: this.settingsService.getUserName(),
          details: {
            part_count: this.bomParseResult.order.line_items.length,
            tool_count: this.bomParseResult.order.tools.length,
            tool_numbers: toolNumbers,
          },
        });

        // Auto-extract template
        const toolModel = this.bomParseResult.order.tools[0]?.tool_model || null;
        await this.bomTemplatesService.autoExtractTemplate(this.bomParseResult.order.line_items, toolModel, this.bomParseResult.order.so_number);

        // Show unclassified parts notification if needed
        if (unclassifiedCount > 0) {
          this.unclassifiedPartsCount = unclassifiedCount;
          this.showUnclassifiedAlert = true;
          // Auto-dismiss after 2 seconds
          setTimeout(() => {
            this.showUnclassifiedAlert = false;
          }, 2000);
        }

        this.router.navigate(['/orders', result.id]);
      }
    } catch (error) {
      console.error('BOM import failed:', error);
    } finally {
      this.isImporting = false;
    }
  }

  clearBomResult(): void {
    this.bomParseResult = null;
    this.bomParseErrors = [];
    this.partConflicts = [];
  }
}
