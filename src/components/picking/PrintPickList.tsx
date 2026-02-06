import { useState } from 'react';
import { Printer, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Order, Tool, LineItem } from '@/types';
import { formatDate } from '@/lib/utils';

interface PrintPickListProps {
  order: Order;
  tools: Tool[];
  lineItems: LineItem[];
  getPicksForTool: (toolId: string) => Map<string, number>;
  currentToolId?: string;
}

interface PrintableToolData {
  tool: Tool;
  items: {
    partNumber: string;
    description: string;
    location: string;
    qtyNeeded: number;
    qtyPicked: number;
    remaining: number;
  }[];
}

export function PrintPickList({
  order,
  tools,
  lineItems,
  getPicksForTool,
  currentToolId,
}: PrintPickListProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [printMode, setPrintMode] = useState<'current' | 'all'>('current');

  const getToolData = (tool: Tool): PrintableToolData => {
    const toolPicks = getPicksForTool(tool.id);
    const items = lineItems.map((item) => {
      const picked = toolPicks.get(item.id) || 0;
      return {
        partNumber: item.part_number,
        description: item.description || '-',
        location: item.location || '-',
        qtyNeeded: item.qty_per_unit,
        qtyPicked: picked,
        remaining: item.qty_per_unit - picked,
      };
    });
    return { tool, items };
  };

  const handlePrint = () => {
    const toolsToPrint =
      printMode === 'current' && currentToolId
        ? tools.filter((t) => t.id === currentToolId)
        : tools;

    const printData = toolsToPrint.map(getToolData);

    const printContent = generatePrintHTML(order, printData);

    printViaIframe(printContent, `Pick List - SO-${order.so_number}`);

    setShowDialog(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setShowDialog(true)}>
        <Printer className="h-4 w-4 mr-2" />
        Print Pick List
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Pick List</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Generate a printable pick list for this order.
            </p>

            <div className="space-y-3">
              <Label>What to print:</Label>
              <div className="space-y-2">
                {currentToolId && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="printMode"
                      value="current"
                      checked={printMode === 'current'}
                      onChange={() => setPrintMode('current')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      Current tool only (
                      {tools.find((t) => t.id === currentToolId)?.tool_number})
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="printMode"
                    value="all"
                    checked={printMode === 'all'}
                    onChange={() => setPrintMode('all')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    All tools ({tools.length} tool{tools.length !== 1 ? 's' : ''})
                  </span>
                </label>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Print Preview includes:</p>
                  <ul className="mt-1 text-muted-foreground list-disc list-inside">
                    <li>Order header (SO#, Customer, PO#, Due Date)</li>
                    <li>Parts table with checkbox column</li>
                    <li>Current pick status</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Print HTML content using a hidden iframe with srcdoc.
 * Uses srcdoc + onload + double requestAnimationFrame to guarantee
 * Chrome's compositor has fully painted before window.print() fires.
 * This prevents the "Loading preview..." hang in the print dialog.
 */
function printViaIframe(htmlContent: string, title?: string) {
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

function generatePrintHTML(order: Order, toolsData: PrintableToolData[]): string {
  const toolSections = toolsData
    .map(
      ({ tool, items }) => `
      <div class="tool-section">
        <div class="tool-header">
          <h2>Tool: ${tool.tool_number}</h2>
          ${tool.serial_number ? `<span class="serial">SN: ${tool.serial_number}</span>` : ''}
        </div>

        <table class="parts-table">
          <thead>
            <tr>
              <th class="checkbox-col"></th>
              <th class="part-col">Part Number</th>
              <th class="desc-col">Description</th>
              <th class="loc-col">Location</th>
              <th class="qty-col">Needed</th>
              <th class="qty-col">Picked</th>
              <th class="qty-col">Remaining</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr class="${item.remaining === 0 ? 'complete' : ''}">
                <td class="checkbox-col">
                  <div class="checkbox ${item.remaining === 0 ? 'checked' : ''}">
                    ${item.remaining === 0 ? '&#10003;' : ''}
                  </div>
                </td>
                <td class="part-col">${item.partNumber}</td>
                <td class="desc-col">${item.description}</td>
                <td class="loc-col">${item.location}</td>
                <td class="qty-col">${item.qtyNeeded}</td>
                <td class="qty-col">${item.qtyPicked}</td>
                <td class="qty-col ${item.remaining > 0 ? 'remaining' : ''}">${item.remaining}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pick List - SO-${order.so_number}</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          padding: 20px;
          color: #333;
        }

        .header {
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }

        .header h1 {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .header-info {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .header-info .info-item {
          padding: 5px 0;
        }

        .header-info .label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
        }

        .header-info .value {
          font-weight: bold;
        }

        .tool-section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }

        .tool-header {
          background: #f5f5f5;
          padding: 10px;
          margin-bottom: 10px;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tool-header h2 {
          font-size: 16px;
        }

        .tool-header .serial {
          color: #666;
          font-size: 11px;
        }

        .parts-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .parts-table th,
        .parts-table td {
          border: 1px solid #ddd;
          padding: 6px 8px;
          text-align: left;
        }

        .parts-table th {
          background: #f9f9f9;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 10px;
        }

        .parts-table tbody tr:nth-child(even) {
          background: #fafafa;
        }

        .parts-table tbody tr.complete {
          background: #f0fff0;
        }

        .checkbox-col {
          width: 30px;
          text-align: center !important;
        }

        .checkbox {
          width: 16px;
          height: 16px;
          border: 2px solid #333;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .checkbox.checked {
          background: #333;
          color: white;
        }

        .part-col {
          width: 150px;
          font-family: monospace;
          font-weight: bold;
        }

        .desc-col {
          min-width: 180px;
        }

        .loc-col {
          width: 100px;
        }

        .qty-col {
          width: 70px;
          text-align: center !important;
        }

        .remaining {
          font-weight: bold;
          color: #c00;
        }

        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #666;
        }

        .signature-line {
          margin-top: 40px;
          display: flex;
          gap: 40px;
        }

        .signature-box {
          flex: 1;
        }

        .signature-box .line {
          border-bottom: 1px solid #333;
          margin-bottom: 5px;
          height: 30px;
        }

        .signature-box .label {
          font-size: 10px;
          color: #666;
        }

        @media print {
          body {
            padding: 10px;
          }

          .tool-section {
            page-break-inside: avoid;
          }

          @page {
            margin: 0.5in;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Pick List - SO-${order.so_number}</h1>
        ${order.tool_model ? `<div style="font-size: 14px; color: #666; margin-bottom: 10px;">Model: ${order.tool_model}</div>` : ''}

        <div class="header-info">
          <div class="info-item">
            <div class="label">Customer</div>
            <div class="value">${order.customer_name || '-'}</div>
          </div>
          <div class="info-item">
            <div class="label">PO Number</div>
            <div class="value">${order.po_number || '-'}</div>
          </div>
          <div class="info-item">
            <div class="label">Order Date</div>
            <div class="value">${formatDate(order.order_date)}</div>
          </div>
          <div class="info-item">
            <div class="label">Due Date</div>
            <div class="value">${formatDate(order.due_date)}</div>
          </div>
        </div>

        ${order.notes ? `<div style="margin-top: 10px; font-style: italic; color: #666;">Notes: ${order.notes}</div>` : ''}
      </div>

      ${toolSections}

      <div class="signature-line">
        <div class="signature-box">
          <div class="line"></div>
          <div class="label">Picked By</div>
        </div>
        <div class="signature-box">
          <div class="line"></div>
          <div class="label">Date</div>
        </div>
        <div class="signature-box">
          <div class="line"></div>
          <div class="label">Verified By</div>
        </div>
      </div>

      <div class="footer">
        <span>Generated: ${new Date().toLocaleString()}</span>
        <span>Tool Pick List Tracker</span>
      </div>
    </body>
    </html>
  `;
}
