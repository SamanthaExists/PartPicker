import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TagData {
  partNumber: string;
  description: string | null;
  location: string | null;
  soNumber: string;
  toolNumber: string;
  qtyPicked: number;
  pickedBy: string;
  pickedAt: Date;
  assembly?: string | null;
}

@Component({
  selector: 'app-print-tag-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal fade show d-block" tabindex="-1" *ngIf="isOpen">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-tag me-2"></i>Print Part Tags
            </h5>
            <button type="button" class="btn-close" (click)="onSkip()"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">
              Print {{ totalTags }} tag{{ totalTags !== 1 ? 's' : '' }} for the picked parts
            </p>

            <!-- Tag Preview -->
            <div class="border rounded mb-3">
              <div class="bg-light px-3 py-2 border-bottom small text-muted">
                Tag Preview (0.66" x 3.4"){{ totalTags > 1 ? ' - showing 1 of ' + totalTags : '' }}
              </div>
              <div class="p-3">
                <div class="border bg-white p-2 d-flex gap-2"
                     style="width: 340px; height: 66px; font-size: 10px; font-family: Arial, sans-serif; margin: 0 auto;">
                  <div class="flex-grow-1 d-flex flex-column justify-content-between overflow-hidden">
                    <div class="d-flex justify-content-between align-items-baseline gap-1">
                      <div class="d-flex align-items-baseline gap-1 text-truncate">
                        <span class="fw-bold font-monospace" style="font-size: 11px;">{{ firstTag?.partNumber }}</span>
                        <span *ngIf="firstTag?.assembly" class="text-muted" style="font-size: 9px;">{{ formatAssemblyPath(firstTag?.assembly) }}</span>
                      </div>
                      <span class="text-muted fw-medium flex-shrink-0" style="font-size: 9px;">Qty: {{ firstTag?.qtyPicked }}</span>
                    </div>
                    <div class="text-truncate text-secondary" style="font-size: 8px;">{{ firstTag?.location || 'N/A' }}</div>
                    <div class="text-truncate text-secondary" style="font-size: 8px;">{{ firstTag?.description || '-' }}</div>
                    <div class="d-flex justify-content-between align-items-end" style="font-size: 7px;">
                      <span class="text-secondary">{{ firstTag?.soNumber }} / {{ firstTag?.toolNumber }}</span>
                      <span class="text-muted">{{ firstTag?.pickedBy }} {{ formatShortDate(firstTag?.pickedAt) }}</span>
                    </div>
                  </div>
                  <div class="flex-shrink-0 d-flex align-items-center justify-content-center border-start ps-2" style="width: 64px;">
                    <div class="d-flex flex-column align-items-center">
                      <div class="d-flex gap-0">
                        <div *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12]"
                             class="bg-black"
                             [style.width.px]="i % 3 === 0 ? 2 : 1"
                             style="height: 28px;"></div>
                      </div>
                      <span style="font-size: 6px;" class="text-muted mt-1">BARCODE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tag Count Summary -->
            <div class="d-flex align-items-center justify-content-between p-3 bg-light rounded mb-3">
              <div>
                <div class="fw-medium">Tags to Print</div>
                <div class="small text-muted">
                  {{ totalTags === 1
                    ? firstTag?.partNumber + ' for ' + firstTag?.toolNumber
                    : firstTag?.partNumber + ' for ' + totalTags + ' tools' }}
                </div>
              </div>
              <span class="badge bg-secondary fs-5 px-3 py-2">{{ totalTags }}</span>
            </div>

            <p class="small text-muted text-center mb-0">
              Select the Brother QL500 printer in the print dialog
            </p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" (click)="onSkip()" [disabled]="isPrinting">
              <i class="bi bi-x me-1"></i>Skip
            </button>
            <button type="button" class="btn btn-primary" (click)="onPrint()" [disabled]="isPrinting">
              <i class="bi bi-printer me-1"></i>
              {{ isPrinting ? 'Opening Print...' : 'Print ' + totalTags + ' Tag' + (totalTags !== 1 ? 's' : '') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="isOpen"></div>
  `,
  styles: [`
    .modal.show { display: block; }
  `]
})
export class PrintTagDialogComponent {
  @Input() isOpen = false;
  @Input() set tagData(value: TagData | TagData[] | null) {
    if (value) {
      this.tagsArray = Array.isArray(value) ? value : [value];
    } else {
      this.tagsArray = [];
    }
  }
  @Output() close = new EventEmitter<void>();

  tagsArray: TagData[] = [];
  isPrinting = false;

  get totalTags(): number {
    return this.tagsArray.length;
  }

  get firstTag(): TagData | undefined {
    return this.tagsArray[0];
  }

  formatShortDate(date: Date | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  formatAssemblyPath(assembly: string | null | undefined): string {
    if (!assembly) return '';
    const parts = assembly.split(' > ');
    parts.reverse();
    return ' < ' + parts.join(' < ');
  }

  onSkip(): void {
    this.close.emit();
  }

  onPrint(): void {
    this.isPrinting = true;

    try {
      const printWindow = window.open('', '_blank', 'width=600,height=400');
      if (!printWindow) {
        alert('Please allow popups to print tags');
        this.isPrinting = false;
        return;
      }

      const printContent = this.generateTagsHTML();
      printWindow.document.write(printContent);
      printWindow.document.close();

      printWindow.onload = () => {
        printWindow.print();
        printWindow.onafterprint = () => {
          printWindow.close();
        };
      };
    } finally {
      this.isPrinting = false;
      this.close.emit();
    }
  }

  private generateTagsHTML(): string {
    const tags = this.tagsArray.map((tag, index) => {
      const { partNumber, description, location, soNumber, toolNumber, qtyPicked, pickedBy, pickedAt, assembly } = tag;
      const date = new Date(pickedAt);
      const shortDate = `${date.getMonth() + 1}/${date.getDate()}`;
      const assemblyPath = this.formatAssemblyPath(assembly);

      return `
        <div class="tag">
          <div class="tag-content">
            <div class="tag-text">
              <div class="tag-row-top">
                <div class="part-number-container">
                  <span class="part-number">${this.escapeHtml(partNumber)}</span>
                  ${assemblyPath ? `<span class="assembly-path">${this.escapeHtml(assemblyPath)}</span>` : ''}
                </div>
                <span class="tag-count">Qty: ${qtyPicked}</span>
              </div>
              <div class="tag-row-location">
                <span class="location">${this.escapeHtml(location || 'N/A')}</span>
              </div>
              <div class="tag-row-middle">
                <span class="description">${this.escapeHtml(description || '-')}</span>
              </div>
              <div class="tag-row-bottom">
                <span class="order-info">${this.escapeHtml(soNumber)} / ${this.escapeHtml(toolNumber)}</span>
                <span class="picked-info">${this.escapeHtml(pickedBy)} ${shortDate}</span>
              </div>
            </div>
            <div class="barcode-container">
              <svg class="barcode" id="barcode-${index}"></svg>
            </div>
          </div>
        </div>
      `;
    });

    const partNumbers = this.tagsArray.map(t => t.partNumber);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Part Tags - ${this.tagsArray[0]?.partNumber || 'Tags'}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <style>
          @page {
            size: 3.4in 0.66in;
            margin: 0;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: Arial, sans-serif;
            font-size: 10px;
            line-height: 1.1;
          }

          .tag {
            width: 3.4in;
            height: 0.66in;
            padding: 0.04in 0.06in 0.04in 0.12in;
            page-break-after: always;
          }

          .tag:last-child {
            page-break-after: auto;
          }

          .tag-content {
            display: flex;
            height: 100%;
            gap: 0.08in;
          }

          .tag-text {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-width: 0;
          }

          .barcode-container {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .barcode {
            height: 0.5in;
            width: auto;
          }

          .tag-row-top {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 0.05in;
          }

          .part-number-container {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;
            flex: 1;
            overflow: hidden;
          }

          .assembly-path {
            font-size: 9px;
            color: #444;
            white-space: nowrap;
          }

          .tag-row-location {
            font-size: 8px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tag-row-middle {
            font-size: 8px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
          }

          .tag-row-bottom {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 7px;
          }

          .part-number {
            font-weight: 900;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            white-space: nowrap;
          }


          .location {
            color: #444;
          }

          .tag-count {
            color: #666;
            font-size: 9px;
            font-weight: 500;
            flex-shrink: 0;
          }

          .description {
            color: #333;
          }

          .order-info {
            color: #444;
          }

          .picked-info {
            color: #666;
            white-space: nowrap;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        ${tags.join('')}
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            const partNumbers = ${JSON.stringify(partNumbers)};
            partNumbers.forEach(function(partNumber, index) {
              try {
                JsBarcode("#barcode-" + index, partNumber, {
                  format: "CODE128",
                  width: 1.5,
                  height: 35,
                  displayValue: false,
                  margin: 0
                });
              } catch (e) {
                console.error('Barcode generation failed:', e);
              }
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
