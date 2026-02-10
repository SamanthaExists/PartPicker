import { useState } from 'react';
import { Printer, X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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

interface PrintTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagData: TagData | TagData[] | null;  // Can be single tag or array of tags
}

export function PrintTagDialog({
  open,
  onOpenChange,
  tagData,
}: PrintTagDialogProps) {
  const [isPrinting, setIsPrinting] = useState(false);

  if (!tagData) return null;

  // Normalize to array
  const tagsArray = Array.isArray(tagData) ? tagData : [tagData];
  const totalTags = tagsArray.length;
  const firstTag = tagsArray[0];

  const handlePrint = async () => {
    setIsPrinting(true);

    try {
      const printContent = generateTagsHTML(tagsArray);
      printViaIframe(printContent, `Part Tags - ${firstTag.partNumber}`);
    } finally {
      setIsPrinting(false);
      onOpenChange(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  // Format date as M/D
  const formatShortDate = (date: Date) => {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Print Part Tags
          </DialogTitle>
          <DialogDescription>
            Print {totalTags} tag{totalTags !== 1 ? 's' : ''} for the picked parts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tag Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
              Tag Preview (0.66" x 3.4"){totalTags > 1 && ` - showing 1 of ${totalTags}`}
            </div>
            <div
              className="bg-white mx-auto my-3 flex flex-col"
              style={{
                width: '340px',
                height: '66px',
                border: '1px solid #ddd',
                padding: '3px 12px 3px 12px',
                fontSize: '10px',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <div className="flex justify-between items-baseline gap-1">
                <span className="min-w-0 truncate">
                  <span className="font-black font-mono" style={{ fontSize: '12px' }}>
                    {firstTag.partNumber}
                  </span>
                  {firstTag.assembly && (
                    <span className="text-gray-500" style={{ fontSize: '10px' }}>
                      {formatAssemblyPath(firstTag.assembly)}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-baseline gap-1" style={{ fontSize: '9px' }}>
                <span className="text-gray-600 truncate">{firstTag.location || 'N/A'}</span>
                <span className="text-gray-500 font-medium flex-shrink-0" style={{ fontSize: '10px' }}>Qty: {firstTag.qtyPicked}</span>
              </div>
              <div className="truncate text-gray-700" style={{ fontSize: '9px' }}>
                {firstTag.description || '-'}
              </div>
              <div className="flex justify-between" style={{ fontSize: '9px' }}>
                <span className="text-gray-600">
                  {firstTag.soNumber} / {firstTag.toolNumber}
                </span>
                <span className="text-gray-500 whitespace-nowrap">
                  {firstTag.pickedBy} {formatShortDate(firstTag.pickedAt)}
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="flex gap-px">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="bg-black"
                      style={{
                        width: i % 3 === 0 ? '2px' : '1px',
                        height: '100%',
                        minHeight: '8px',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tag Count Summary */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Tags to Print</p>
              <p className="text-sm text-muted-foreground">
                {totalTags === 1
                  ? `${firstTag.partNumber} for ${firstTag.toolNumber}`
                  : `${firstTag.partNumber} for ${totalTags} tools`}
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {totalTags}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Select the Brother QL500 printer in the print dialog
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip} disabled={isPrinting}>
            <X className="h-4 w-4 mr-2" />
            Skip
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting}>
            <Printer className="h-4 w-4 mr-2" />
            {isPrinting ? 'Opening Print...' : `Print ${totalTags} Tag${totalTags !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatAssemblyPath(assembly: string | null): string {
  if (!assembly) return '';
  const parts = assembly.split(' > ');
  parts.reverse();
  return ' < ' + parts.join(' < ');
}

function generateBarcodeSVG(value: string): string {
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

function generateTagsHTML(tagsArray: TagData[]): string {
  // Pre-render barcodes in the parent window so the print page has no external dependencies
  const tags = tagsArray.map((tag) => {
    const { partNumber, description, location, soNumber, toolNumber, qtyPicked, pickedBy, pickedAt, assembly } = tag;

    const date = new Date(pickedAt);
    const shortDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    const barcodeSVG = generateBarcodeSVG(partNumber);
    const assemblyPath = formatAssemblyPath(assembly);

    return `
      <div class="tag">
        <div class="tag-row-top">
          <span class="tag-row-top-left"><span class="part-number">${escapeHtml(partNumber)}</span>${assemblyPath ? `<span class="assembly-path">${escapeHtml(assemblyPath)}</span>` : ''}</span>
        </div>
        <div class="tag-row-location">
          <span class="location">${escapeHtml(location || 'N/A')}</span>
          <span class="tag-count">Qty: ${qtyPicked}</span>
        </div>
        <div class="tag-row-middle">
          <span class="description">${escapeHtml(description || '-')}</span>
        </div>
        <div class="tag-row-bottom">
          <span class="order-info">${escapeHtml(soNumber)} / ${escapeHtml(toolNumber)}</span>
          <span class="picked-info">${escapeHtml(pickedBy)} ${shortDate}</span>
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
      <title>Part Tags - ${tagsArray[0].partNumber}</title>
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

/**
 * Print HTML content using a hidden iframe with srcdoc.
 * Uses srcdoc + onload + double requestAnimationFrame to guarantee
 * Chrome's compositor has fully painted before window.print() fires.
 * This prevents the "Loading preview..." hang in the print dialog.
 */
function printViaIframe(htmlContent: string, title?: string) {
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
