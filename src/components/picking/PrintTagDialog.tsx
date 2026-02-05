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
      // Open a single print window with all tags
      const printWindow = window.open('', '_blank', 'width=600,height=400');
      if (!printWindow) {
        alert('Please allow popups to print tags');
        setIsPrinting(false);
        return;
      }

      const printContent = generateTagsHTML(tagsArray);
      printWindow.document.write(printContent);
      printWindow.document.close();

      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.onafterprint = () => {
          printWindow.close();
        };
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
              className="bg-white mx-auto my-3 flex gap-2"
              style={{
                width: '340px',
                height: '66px',
                border: '1px solid #ddd',
                padding: '3px 6px 3px 12px',
                fontSize: '10px',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              <div className="flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
                <div className="flex justify-between items-start gap-1" style={{ fontSize: '11px' }}>
                  <span className="font-black font-mono truncate min-w-0 flex-1" style={{ fontSize: '14px' }}>
                    {firstTag.partNumber}
                  </span>
                  <span className="text-gray-500 font-medium flex-shrink-0">Qty: {firstTag.qtyPicked}</span>
                </div>
                <div className="flex justify-between items-center gap-1 overflow-hidden" style={{ fontSize: '9px' }}>
                  <span className="text-gray-600 flex-shrink-0" style={{ fontSize: '9px' }}>
                    LOC: {firstTag.location || 'N/A'}
                  </span>
                  <span className="truncate text-gray-700 overflow-hidden min-w-0">
                    {firstTag.description || '-'}
                  </span>
                </div>
                <div className="flex justify-between items-end" style={{ fontSize: '8px' }}>
                  <span className="text-gray-600">
                    {firstTag.soNumber} / {firstTag.toolNumber}
                  </span>
                  <span className="text-gray-500 whitespace-nowrap">
                    {firstTag.pickedBy} {formatShortDate(firstTag.pickedAt)}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center justify-center w-16 border-l pl-2">
                <div className="flex flex-col items-center">
                  <div className="flex gap-px">
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="bg-black"
                        style={{
                          width: i % 3 === 0 ? '2px' : '1px',
                          height: '28px',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[6px] text-gray-400 mt-0.5">BARCODE</span>
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

function generateTagsHTML(tagsArray: TagData[]): string {
  // Generate HTML for each tag (1 tag per entry)
  const tags = tagsArray.map((tag, index) => {
    const { partNumber, description, location, soNumber, toolNumber, qtyPicked, pickedBy, pickedAt } = tag;

    // Format date as M/D
    const date = new Date(pickedAt);
    const shortDate = `${date.getMonth() + 1}/${date.getDate()}`;

    return `
      <div class="tag">
        <div class="tag-content">
          <div class="tag-text">
            <div class="tag-row-top">
              <span class="part-number">${escapeHtml(partNumber)}</span>
              <span class="tag-count">Qty: ${qtyPicked}</span>
            </div>
            <div class="tag-row-middle">
              <span class="location">LOC: ${escapeHtml(location || 'N/A')}</span>
              <span class="description">${escapeHtml(description || '-')}</span>
            </div>
            <div class="tag-row-bottom">
              <span class="order-info">${escapeHtml(soNumber)} / ${escapeHtml(toolNumber)}</span>
              <span class="picked-info">${escapeHtml(pickedBy)} ${shortDate}</span>
            </div>
          </div>
          <div class="barcode-container">
            <svg class="barcode" id="barcode-${index}"></svg>
          </div>
        </div>
      </div>
    `;
  });

  // Get first tag's part number for barcode generation
  const partNumbers = tagsArray.map(t => t.partNumber);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Part Tags - ${tagsArray[0].partNumber}</title>
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
          line-height: 1.2;
        }

        .tag {
          width: 3.4in;
          height: 0.66in;
          padding: 0.03in 0.06in 0.03in 0.12in;
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
          overflow: hidden;
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
          align-items: flex-start;
          font-size: 11px;
          gap: 0.05in;
        }

        .tag-row-middle {
          font-size: 9px;
          display: flex;
          align-items: center;
          gap: 0.08in;
          min-width: 0;
          overflow: hidden;
        }

        .tag-row-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 8px;
        }

        .part-number {
          font-weight: 900;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        }

        .location {
          color: #444;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .tag-count {
          color: #666;
          font-weight: 500;
          flex-shrink: 0;
        }

        .description {
          color: #333;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
          max-width: 100%;
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
        // Generate barcodes after page loads
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
