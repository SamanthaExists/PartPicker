import * as XLSX from 'xlsx';
import type { Order, Tool, Pick, OrderWithProgress, ConsolidatedPart, LineItemWithPicks, ItemToOrder } from '@/types';
import { format } from 'date-fns';

/**
 * Helper to trigger file download in the browser
 */
function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a date string for display
 */
function formatDateForExport(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return dateStr;
  }
}

/**
 * Apply column widths to a worksheet
 */
function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

/**
 * Export a single order with line items and pick status
 */
export function exportOrderToExcel(
  order: Order,
  tools: Tool[],
  lineItemsWithPicks: LineItemWithPicks[],
  picks: Pick[]
) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Order Summary
  const orderSummary = [
    ['Order Export'],
    [],
    ['SO Number', `SO-${order.so_number}`],
    ['PO Number', order.po_number || ''],
    ['Customer', order.customer_name || ''],
    ['Tool Model', order.tool_model || ''],
    ['Quantity', order.quantity || 1],
    ['Status', order.status],
    ['Order Date', formatDateForExport(order.order_date)],
    ['Due Date', formatDateForExport(order.due_date)],
    ['Notes', order.notes || ''],
    [],
    ['Export Date', formatTimestamp(new Date().toISOString())],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(orderSummary);
  setColumnWidths(summarySheet, [15, 40]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Order Info');

  // Sheet 2: Tools
  const toolsHeader = ['Tool Number', 'Serial Number', 'Status'];
  const toolsData = tools.map(tool => [
    tool.tool_number,
    tool.serial_number || '',
    tool.status,
  ]);
  const toolsSheet = XLSX.utils.aoa_to_sheet([toolsHeader, ...toolsData]);
  setColumnWidths(toolsSheet, [20, 25, 15]);
  XLSX.utils.book_append_sheet(workbook, toolsSheet, 'Tools');

  // Sheet 3: Line Items with Pick Status
  const lineItemsHeader = [
    'Part Number',
    'Description',
    'Location',
    'Qty Per Unit',
    'Total Needed',
    'Total Picked',
    'Remaining',
    'Status',
  ];
  const lineItemsData = lineItemsWithPicks.map(item => [
    item.part_number,
    item.description || '',
    item.location || '',
    item.qty_per_unit,
    item.total_qty_needed,
    item.total_picked,
    item.remaining,
    item.remaining === 0 ? 'Complete' : 'Pending',
  ]);
  const lineItemsSheet = XLSX.utils.aoa_to_sheet([lineItemsHeader, ...lineItemsData]);
  setColumnWidths(lineItemsSheet, [20, 40, 15, 12, 12, 12, 12, 12]);
  XLSX.utils.book_append_sheet(workbook, lineItemsSheet, 'Line Items');

  // Sheet 4: Pick History
  const picksHeader = [
    'Picked At',
    'Picked By',
    'Part Number',
    'Tool',
    'Qty Picked',
    'Notes',
  ];

  // Create a map of line item id to part number
  const lineItemMap = new Map<string, string>();
  for (const item of lineItemsWithPicks) {
    lineItemMap.set(item.id, item.part_number);
  }

  // Create a map of tool id to tool number
  const toolMap = new Map<string, string>();
  for (const tool of tools) {
    toolMap.set(tool.id, tool.tool_number);
  }

  const picksData = picks.map(pick => [
    formatTimestamp(pick.picked_at),
    pick.picked_by || 'Unknown',
    lineItemMap.get(pick.line_item_id) || pick.line_item_id,
    toolMap.get(pick.tool_id) || pick.tool_id,
    pick.qty_picked,
    pick.notes || '',
  ]);

  const picksSheet = XLSX.utils.aoa_to_sheet([picksHeader, ...picksData]);
  setColumnWidths(picksSheet, [20, 20, 20, 15, 12, 40]);
  XLSX.utils.book_append_sheet(workbook, picksSheet, 'Pick History');

  // Download the file
  const filename = `SO-${order.so_number}-export-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  downloadWorkbook(workbook, filename);
}

/**
 * Export all orders summary to Excel
 */
export function exportOrdersSummaryToExcel(orders: OrderWithProgress[]) {
  const workbook = XLSX.utils.book_new();

  // Orders Summary Sheet
  const ordersHeader = [
    'SO Number',
    'PO Number',
    'Customer',
    'Tool Model',
    'Quantity',
    'Status',
    'Order Date',
    'Due Date',
    'Tools Count',
    'Total Items',
    'Picked Items',
    'Progress %',
    'Notes',
  ];

  const ordersData = orders.map(order => [
    `SO-${order.so_number}`,
    order.po_number || '',
    order.customer_name || '',
    order.tool_model || '',
    order.quantity || 1,
    order.status,
    formatDateForExport(order.order_date),
    formatDateForExport(order.due_date),
    order.tools?.length || 0,
    order.total_items,
    order.picked_items,
    order.progress_percent,
    order.notes || '',
  ]);

  const ordersSheet = XLSX.utils.aoa_to_sheet([ordersHeader, ...ordersData]);
  setColumnWidths(ordersSheet, [15, 15, 25, 15, 10, 12, 12, 12, 12, 12, 12, 12, 40]);
  XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Orders');

  // Summary Stats Sheet
  const activeOrders = orders.filter(o => o.status === 'active').length;
  const completeOrders = orders.filter(o => o.status === 'complete').length;
  const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
  const totalItems = orders.reduce((sum, o) => sum + o.total_items, 0);
  const totalPicked = orders.reduce((sum, o) => sum + o.picked_items, 0);

  const summaryData = [
    ['Orders Summary Report'],
    [],
    ['Total Orders', orders.length],
    ['Active Orders', activeOrders],
    ['Complete Orders', completeOrders],
    ['Cancelled Orders', cancelledOrders],
    [],
    ['Total Items Needed', totalItems],
    ['Total Items Picked', totalPicked],
    ['Overall Progress', totalItems > 0 ? `${Math.round((totalPicked / totalItems) * 100)}%` : 'N/A'],
    [],
    ['Export Date', formatTimestamp(new Date().toISOString())],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  setColumnWidths(summarySheet, [20, 20]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Download the file
  const filename = `orders-export-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  downloadWorkbook(workbook, filename);
}

/**
 * Export consolidated parts list to Excel
 */
export function exportConsolidatedPartsToExcel(parts: ConsolidatedPart[]) {
  const workbook = XLSX.utils.book_new();

  // Main Parts Sheet
  const partsHeader = [
    'Part Number',
    'Description',
    'Location',
    'Total Needed',
    'Total Picked',
    'Remaining',
    'Status',
    'Orders Using Part',
  ];

  const partsData = parts.map(part => [
    part.part_number,
    part.description || '',
    part.location || '',
    part.total_needed,
    part.total_picked,
    part.remaining,
    part.remaining === 0 ? 'Complete' : 'Pending',
    part.orders.map(o => `SO-${o.so_number}`).join(', '),
  ]);

  const partsSheet = XLSX.utils.aoa_to_sheet([partsHeader, ...partsData]);
  setColumnWidths(partsSheet, [20, 40, 15, 12, 12, 12, 12, 40]);
  XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');

  // Detailed Breakdown Sheet (part by order)
  const detailHeader = [
    'Part Number',
    'Description',
    'Location',
    'SO Number',
    'Needed',
    'Picked',
    'Remaining',
  ];

  const detailData: (string | number)[][] = [];
  for (const part of parts) {
    for (const orderInfo of part.orders) {
      detailData.push([
        part.part_number,
        part.description || '',
        part.location || '',
        `SO-${orderInfo.so_number}`,
        orderInfo.needed,
        orderInfo.picked,
        orderInfo.needed - orderInfo.picked,
      ]);
    }
  }

  const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailData]);
  setColumnWidths(detailSheet, [20, 40, 15, 15, 12, 12, 12]);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail by Order');

  // Summary Stats Sheet
  const totalParts = parts.length;
  const completeParts = parts.filter(p => p.remaining === 0).length;
  const totalNeeded = parts.reduce((sum, p) => sum + p.total_needed, 0);
  const totalPicked = parts.reduce((sum, p) => sum + p.total_picked, 0);

  const summaryData = [
    ['Consolidated Parts Report'],
    [],
    ['Unique Parts', totalParts],
    ['Complete Parts', completeParts],
    ['Pending Parts', totalParts - completeParts],
    [],
    ['Total Qty Needed', totalNeeded],
    ['Total Qty Picked', totalPicked],
    ['Total Qty Remaining', totalNeeded - totalPicked],
    ['Overall Progress', totalNeeded > 0 ? `${Math.round((totalPicked / totalNeeded) * 100)}%` : 'N/A'],
    [],
    ['Export Date', formatTimestamp(new Date().toISOString())],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  setColumnWidths(summarySheet, [20, 20]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Download the file
  const filename = `consolidated-parts-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  downloadWorkbook(workbook, filename);
}

/**
 * Export pick history to Excel (for a single order or all orders)
 */
export interface PickHistoryItem {
  picked_at: string;
  picked_by: string | null;
  qty_picked: number;
  notes: string | null;
  part_number: string;
  tool_number: string;
  so_number: string;
}

export function exportPickHistoryToExcel(picks: PickHistoryItem[], title?: string) {
  const workbook = XLSX.utils.book_new();

  // Pick History Sheet
  const picksHeader = [
    'Picked At',
    'Picked By',
    'SO Number',
    'Part Number',
    'Tool Number',
    'Qty Picked',
    'Notes',
  ];

  const picksData = picks.map(pick => [
    formatTimestamp(pick.picked_at),
    pick.picked_by || 'Unknown',
    `SO-${pick.so_number}`,
    pick.part_number,
    pick.tool_number,
    pick.qty_picked,
    pick.notes || '',
  ]);

  const picksSheet = XLSX.utils.aoa_to_sheet([picksHeader, ...picksData]);
  setColumnWidths(picksSheet, [20, 20, 15, 20, 15, 12, 40]);
  XLSX.utils.book_append_sheet(workbook, picksSheet, 'Pick History');

  // Summary Sheet
  const totalPicks = picks.length;
  const totalQty = picks.reduce((sum, p) => sum + p.qty_picked, 0);
  const uniqueUsers = new Set(picks.map(p => p.picked_by || 'Unknown')).size;
  const uniqueParts = new Set(picks.map(p => p.part_number)).size;

  const summaryData = [
    [title || 'Pick History Report'],
    [],
    ['Total Pick Records', totalPicks],
    ['Total Qty Picked', totalQty],
    ['Unique Users', uniqueUsers],
    ['Unique Parts', uniqueParts],
    [],
    ['Export Date', formatTimestamp(new Date().toISOString())],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  setColumnWidths(summarySheet, [20, 20]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Download the file
  const filename = `pick-history-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  downloadWorkbook(workbook, filename);
}

/**
 * Export items to order list to Excel
 */
export function exportItemsToOrderToExcel(items: ItemToOrder[]) {
  const workbook = XLSX.utils.book_new();

  // Main Items Sheet
  const itemsHeader = [
    'Part Number',
    'Description',
    'Location',
    'Qty Available',
    'Total Needed',
    'Total Picked',
    'Remaining',
    'Qty to Order',
    'Orders Affected',
  ];

  const itemsData = items.map(item => [
    item.part_number,
    item.description || '',
    item.location || '',
    item.qty_available,
    item.total_needed,
    item.total_picked,
    item.remaining,
    item.qty_to_order,
    item.orders.map(o => `SO-${o.so_number}`).join(', '),
  ]);

  const itemsSheet = XLSX.utils.aoa_to_sheet([itemsHeader, ...itemsData]);
  setColumnWidths(itemsSheet, [20, 40, 15, 12, 12, 12, 12, 12, 40]);
  XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items to Order');

  // Detailed Breakdown Sheet (item by order)
  const detailHeader = [
    'Part Number',
    'Description',
    'Location',
    'SO Number',
    'Needed',
    'Picked',
    'Remaining',
  ];

  const detailData: (string | number)[][] = [];
  for (const item of items) {
    for (const orderInfo of item.orders) {
      detailData.push([
        item.part_number,
        item.description || '',
        item.location || '',
        `SO-${orderInfo.so_number}`,
        orderInfo.needed,
        orderInfo.picked,
        orderInfo.needed - orderInfo.picked,
      ]);
    }
  }

  const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailData]);
  setColumnWidths(detailSheet, [20, 40, 15, 15, 12, 12, 12]);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail by Order');

  // Summary Stats Sheet
  const totalItems = items.length;
  const totalQtyNeeded = items.reduce((sum, p) => sum + p.remaining, 0);
  const totalOrders = new Set(items.flatMap(item => item.orders.map(o => o.order_id))).size;

  const summaryData = [
    ['Items to Order Report'],
    [],
    ['Unique Parts to Order', totalItems],
    ['Total Qty Still Needed', totalQtyNeeded],
    ['Orders Affected', totalOrders],
    [],
    ['Export Date', formatTimestamp(new Date().toISOString())],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  setColumnWidths(summarySheet, [25, 20]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Download the file
  const filename = `items-to-order-${format(new Date(), 'yyyyMMdd')}.xlsx`;
  downloadWorkbook(workbook, filename);
}
