import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import JsBarcode from 'jsbarcode';

export interface TagData {
  partNumber: string;
  description: string | null;
  location: string | null;
  soNumber: string;
  toolNumber: string;
  qtyPicked: number;
  pickedBy: string;
  pickedAt: Date;
  assembly: string | null;
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
                <div class="border bg-white d-flex flex-column"
                     style="width: 340px; height: 66px; padding: 3px 12px 3px 12px; font-size: 10px; font-family: Arial, sans-serif; margin: 0 auto;">
                  <div class="d-flex justify-content-between align-items-baseline gap-1">
                    <span class="text-truncate" style="min-width: 0;">
                      <span class="fw-bolder font-monospace" style="font-size: 12px;">{{ firstTag?.partNumber }}</span>
                      <span *ngIf="firstTag?.assembly" class="text-secondary" style="font-size: 10px;">{{ formatAssemblyPath(firstTag?.assembly) }}</span>
                    </span>
                  </div>
                  <div class="d-flex justify-content-between align-items-baseline gap-1" style="font-size: 9px;">
                    <span class="text-truncate" style="color: #444;">{{ firstTag?.location || 'N/A' }}</span>
                    <span class="fw-medium flex-shrink-0" style="color: #666; font-size: 10px;">Qty: {{ firstTag?.qtyPicked }}</span>
                  </div>
                  <div class="text-truncate" style="font-size: 9px; color: #333;">
                    {{ firstTag?.description || '-' }}
                  </div>
                  <div class="d-flex justify-content-between" style="font-size: 9px;">
                    <span style="color: #444;">{{ firstTag?.soNumber }} / {{ firstTag?.toolNumber }}</span>
                    <span class="text-nowrap" style="color: #666;">{{ firstTag?.pickedBy }} {{ formatShortDate(firstTag?.pickedAt) }}</span>
                  </div>
                  <div class="flex-grow-1 d-flex align-items-center justify-content-center" style="min-height: 0;">
                    <div class="d-flex" style="gap: 1px;">
                      <div *ngFor="let i of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]"
                           class="bg-black"
                           [style.width.px]="i % 3 === 0 ? 2 : 1"
                           style="height: 100%; min-height: 8px;"></div>
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
      console.log('Print Tag Data:', this.tagsArray);
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
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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
      const printContent = this.generateTagsHTML();
      const firstTag = this.tagsArray[0];
      this.printViaIframe(printContent, `Part Tags - ${firstTag?.partNumber || 'Tags'}`);
    } finally {
      this.isPrinting = false;
      this.close.emit();
    }
  }

  private printViaIframe(htmlContent: string, title?: string): void {
    // Strip any embedded <script> tags — we control print timing from here
    const cleanHTML = htmlContent.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Use full viewport dimensions positioned off-screen. Chrome skips
    // layout/paint for zero-size iframes, causing print preview to hang.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = `-${vh + 100}px`;
    iframe.style.left = `-${vw + 100}px`;
    iframe.style.width = `${vw}px`;
    iframe.style.height = `${vh}px`;
    iframe.style.border = 'none';

    // Temporarily set the parent document's title so the print dialog shows it
    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    const cleanup = () => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      if (title) {
        document.title = originalTitle;
      }
    };

    // onload fires after srcdoc content is fully parsed and rendered
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }

      win.onafterprint = cleanup;

      // Force synchronous layout so the compositor has geometry to work with
      const body = win.document.body;
      if (body) {
        void body.offsetHeight;
      }

      // Double rAF guarantees at least one full composite pass is complete
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          win.focus();
          win.print();
        });
      });
    };

    // srcdoc triggers a proper document load cycle (unlike document.write),
    // so onload fires reliably after content is rendered
    iframe.srcdoc = cleanHTML;
    document.body.appendChild(iframe);

    // Safety net: clean up after 60s if onafterprint never fires
    setTimeout(cleanup, 60000);
  }

  private generateBarcodeSVG(value: string): string {
    // Create a temporary SVG element, render the barcode, and return the SVG string
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      // Use a moderate module width. The SVG will be scaled by CSS to fill
      // ~80% of the 3.16" printable tag width via max-width on the container.
      // width:2 gives clear separation between bars at print resolution.
      JsBarcode(svg, value, {
        format: 'CODE128',
        width: 2,
        height: 30,
        displayValue: false,
        margin: 0,
      });
    } catch (e) {
      console.error('Barcode generation failed:', e);
    }
    // Remove fixed dimensions so CSS controls sizing. 'none' is safe for
    // barcodes — horizontal stretch is uniform so relative bar widths are
    // preserved. The container CSS constrains width to ~80% of the tag.
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'none');
    return svg.outerHTML;
  }

  private generateTagsHTML(): string {
    // Pre-render barcodes in the parent window so the print page has no external dependencies
    const tags = this.tagsArray.map((tag) => {
      const { partNumber, description, location, soNumber, toolNumber, qtyPicked, pickedBy, pickedAt, assembly } = tag;

      const date = new Date(pickedAt);
      const shortDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
      const barcodeSVG = this.generateBarcodeSVG(partNumber);
      const assemblyPath = this.formatAssemblyPath(assembly);

      return `
      <div class="tag">
        <div class="tag-row-top">
          <span class="tag-row-top-left"><span class="part-number">${this.escapeHtml(partNumber)}</span>${assemblyPath ? `<span class="assembly-path">${this.escapeHtml(assemblyPath)}</span>` : ''}</span>
        </div>
        <div class="tag-row-location">
          <span class="location">${this.escapeHtml(location || 'N/A')}</span>
          <span class="tag-count">Qty: ${qtyPicked}</span>
        </div>
        <div class="tag-row-middle">
          <span class="description">${this.escapeHtml(description || '-')}</span>
        </div>
        <div class="tag-row-bottom">
          <span class="order-info">${this.escapeHtml(soNumber)} / ${this.escapeHtml(toolNumber)}</span>
          <span class="picked-info">${this.escapeHtml(pickedBy)} ${shortDate}</span>
        </div>
        <div class="barcode-container">
          ${barcodeSVG}
        </div>
      </div>
    `;
    });

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Part Tags - ${this.tagsArray[0]?.partNumber || 'Tags'}</title>
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
          line-height: 1;
        }

        .tag {
          width: 3.4in;
          height: 0.66in;
          padding: 0.04in 0.12in 0.03in 0.12in;
          page-break-after: always;
          display: flex;
          flex-direction: column;
        }

        .tag:last-child {
          page-break-after: auto;
        }

        .tag-row-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.05in;
        }

        .tag-row-top-left {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .assembly-path {
          font-weight: normal;
          font-size: 10px;
          color: #444;
        }

        .barcode-container {
          flex: 1;
          display: flex;
          align-items: stretch;
          justify-content: center;
          min-height: 0;
          overflow: hidden;
          width: 80%;
          margin: 0 auto;
        }

        .barcode-container svg {
          width: 100%;
          height: 100%;
        }

        .tag-row-location {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.05in;
          font-size: 9px;
        }

        .tag-row-middle {
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .tag-row-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 9px;
        }

        .part-number {
          font-weight: 900;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          white-space: nowrap;
        }

        .location {
          color: #444;
        }

        .tag-count {
          color: #666;
          font-size: 10px;
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
