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

      // Use a Blob URL so the page loads as a real document with reliable onload
      const blob = new Blob([printContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank', 'width=600,height=400');
      if (!printWindow) {
        URL.revokeObjectURL(url);
        alert('Please allow popups to print tags');
        setIsPrinting(false);
        return;
      }

      // Don't revoke the blob URL until after printing — Chrome's print
      // preview can lose access to the content if it's revoked too early.
      printWindow.onafterprint = () => {
        URL.revokeObjectURL(url);
        printWindow.close();
      };
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
    return `${date.getMonth() + 1}/${date.getDate()}`;
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
                padding: '3px 6px 3px 12px',
                fontSize: '10px',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <div className="flex justify-between items-baseline gap-1">
                <span className="font-black font-mono" style={{ fontSize: '12px' }}>
                  {firstTag.partNumber}
                </span>
                <span className="text-gray-500 font-medium flex-shrink-0" style={{ fontSize: '10px' }}>Qty: {firstTag.qtyPicked}</span>
              </div>
              <div className="flex-1 flex gap-2 min-h-0">
                <div className="flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
                  <div className="truncate text-gray-600" style={{ fontSize: '9px' }}>
                    {firstTag.location || 'N/A'}
                  </div>
                  <div className="truncate text-gray-700" style={{ fontSize: '9px' }}>
                    {firstTag.description || '-'}
                  </div>
                  <div className="flex justify-between items-end" style={{ fontSize: '9px' }}>
                    <span className="text-gray-600">
                      {firstTag.soNumber} / {firstTag.toolNumber}
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">
                      {firstTag.pickedBy} {formatShortDate(firstTag.pickedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center justify-center border-l pl-2">
                  <div className="flex flex-col items-center">
                    <div className="flex gap-px">
                      {[...Array(12)].map((_, i) => (
                        <div
                          key={i}
                          className="bg-black"
                          style={{
                            width: i % 3 === 0 ? '2px' : '1px',
                            height: '20px',
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[6px] text-gray-400 mt-0.5">BARCODE</span>
                  </div>
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

function generateBarcodeSVG(value: string): string {
  // Create a temporary SVG element, render the barcode, and return the SVG string
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      width: 1.5,
      height: 25,
      displayValue: false,
      margin: 0,
    });
  } catch (e) {
    console.error('Barcode generation failed:', e);
  }
  return svg.outerHTML;
}

function generateTagsHTML(tagsArray: TagData[]): string {
  // Pre-render barcodes in the parent window so the print page has no external dependencies
  const tags = tagsArray.map((tag) => {
    const { partNumber, description, location, soNumber, toolNumber, qtyPicked, pickedBy, pickedAt } = tag;

    const date = new Date(pickedAt);
    const shortDate = `${date.getMonth() + 1}/${date.getDate()}`;
    const barcodeSVG = generateBarcodeSVG(partNumber);

    return `
      <div class="tag">
        <div class="tag-row-top">
          <span class="part-number">${escapeHtml(partNumber)}</span>
          <span class="tag-count">Qty: ${qtyPicked}</span>
        </div>
        <div class="tag-bottom">
          <div class="tag-text">
            <div class="tag-row-location">
              <span class="location">${escapeHtml(location || 'N/A')}</span>
            </div>
            <div class="tag-row-middle">
              <span class="description">${escapeHtml(description || '-')}</span>
            </div>
            <div class="tag-row-bottom">
              <span class="order-info">${escapeHtml(soNumber)} / ${escapeHtml(toolNumber)}</span>
              <span class="picked-info">${escapeHtml(pickedBy)} ${shortDate}</span>
            </div>
          </div>
          <div class="barcode-container">
            ${barcodeSVG}
          </div>
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
          padding: 0.04in 0.06in 0.03in 0.12in;
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

        .tag-bottom {
          flex: 1;
          display: flex;
          gap: 0.05in;
          min-height: 0;
        }

        .tag-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-width: 0;
          overflow: hidden;
        }

        .barcode-container {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .barcode-container svg {
          height: 0.35in;
          width: auto;
        }

        .tag-row-location {
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
      <script>
        // Delay print() until Chrome has fully painted the content.
        // Without this, Chrome's print preview shows a loading spinner
        // forever because print() fires before the first paint completes.
        // setTimeout is used instead of requestAnimationFrame because rAF
        // can be throttled/paused in newly opened unfocused windows.
        window.onload = function() {
          setTimeout(function() {
            window.focus();
            window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
