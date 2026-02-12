import { Injectable } from '@angular/core';
import { ImportedOrder, ImportedTool, ImportedLineItem, Order, Tool, LineItemWithPicks, Pick, OrderWithProgress, ItemToOrder, Issue, PartsCatalogItem, BOMTemplate, BOMTemplateItem, PickUndo } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class ExcelService {
  constructor(private supabase: SupabaseService) {}

  async parseEnhancedExcelFile(file: File): Promise<{
    success: boolean;
    order?: ImportedOrder;
    errors: string[];
    warnings: string[];
  }> {
    const XLSX = await import('xlsx');
    return new Promise((resolve) => {
      const reader = new FileReader();
      const errors: string[] = [];
      const warnings: string[] = [];

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          // Check for Order Info sheet
          const orderInfoSheet = workbook.SheetNames.find(
            name => name.toLowerCase().includes('order') || name.toLowerCase().includes('info')
          );

          const partsSheet = workbook.SheetNames.find(
            name => name.toLowerCase() === 'parts' || name.toLowerCase() === 'bom'
          );

          let soNumber = '';
          let poNumber = '';
          let customerName = '';
          let orderDate = '';
          let dueDate = '';
          let toolQty = 1;
          let toolModel = '';

          // Parse Order Info sheet if exists
          if (orderInfoSheet) {
            const sheet = workbook.Sheets[orderInfoSheet];
            const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

            for (const row of json) {
              if (!row || row.length < 2) continue;
              const label = String(row[0] || '').toLowerCase().trim();
              const value = row[1];

              if (label.includes('so') && label.includes('number')) {
                soNumber = String(value || '').trim();
              } else if (label.includes('po') && label.includes('number')) {
                poNumber = String(value || '').trim();
              } else if (label.includes('customer')) {
                customerName = String(value || '').trim();
              } else if (label.includes('order') && label.includes('date')) {
                orderDate = this.parseDate(XLSX, value);
              } else if (label.includes('due') && label.includes('date')) {
                dueDate = this.parseDate(XLSX, value);
              } else if (label.includes('tool') && label.includes('qty')) {
                toolQty = parseInt(String(value || '1'), 10) || 1;
              } else if (label.includes('model')) {
                toolModel = String(value || '').trim();
              }
            }
          }

          // Extract SO number from filename if not found
          if (!soNumber) {
            const match = file.name.match(/SO[-_]?(\d+)/i);
            if (match) {
              soNumber = match[1];
            } else {
              errors.push('Could not determine SO number');
              resolve({ success: false, errors, warnings });
              return;
            }
          }

          // Generate tools
          const tools: ImportedTool[] = [];
          for (let i = 1; i <= toolQty; i++) {
            tools.push({
              tool_number: `${soNumber}-${i}`,
              tool_model: toolModel || undefined,
            });
          }

          // Parse Parts sheet with hierarchical BOM support
          let lineItems: ImportedLineItem[] = [];

          if (partsSheet) {
            const sheet = workbook.Sheets[partsSheet];
            const json = XLSX.utils.sheet_to_json<any>(sheet);
            lineItems = this.processHierarchicalBOM(json, toolQty);
          } else {
            // Try first sheet as parts sheet
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<any>(firstSheet);
            lineItems = this.processHierarchicalBOM(json, toolQty);
          }

          if (lineItems.length === 0) {
            warnings.push('No line items found in the file');
          }

          const order: ImportedOrder = {
            so_number: soNumber,
            po_number: poNumber || undefined,
            customer_name: customerName || undefined,
            order_date: orderDate || undefined,
            due_date: dueDate || undefined,
            tools,
            line_items: lineItems,
          };

          resolve({ success: true, order, errors, warnings });
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Failed to parse Excel file');
          resolve({ success: false, errors, warnings });
        }
      };

      reader.onerror = () => {
        errors.push('Failed to read file');
        resolve({ success: false, errors, warnings });
      };

      reader.readAsArrayBuffer(file);
    });
  }

  async parseCsvFile(file: File): Promise<{
    success: boolean;
    order?: ImportedOrder;
    errors: string[];
    warnings: string[];
  }> {
    const XLSX = await import('xlsx');
    return new Promise((resolve) => {
      const reader = new FileReader();
      const errors: string[] = [];
      const warnings: string[] = [];

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const workbook = XLSX.read(text, { type: 'string' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(sheet);

          // Extract SO number from filename
          const match = file.name.match(/SO[-_]?(\d+)/i);
          const soNumber = match ? match[1] : 'Unknown';

          if (soNumber === 'Unknown') {
            warnings.push('Could not determine SO number from filename');
          }

          const lineItems: ImportedLineItem[] = [];

          for (const row of json) {
            const partNumber = this.findValue(row, ['part', 'part number', 'part_number', 'partnumber', 'pn']);
            if (!partNumber) continue;

            const description = this.findValue(row, ['description', 'desc', 'name']);
            const location = this.findValue(row, ['location', 'loc', 'bin', 'position']);
            const qtyPerUnit = parseInt(this.findValue(row, ['qty', 'quantity', 'qty/unit', 'qty_per_unit']) || '1', 10) || 1;
            const classification = this.findValue(row, ['classification', 'classification_type', 'type', 'class']);

            lineItems.push({
              part_number: String(partNumber).trim(),
              description: description ? String(description).trim() : undefined,
              location: location ? String(location).trim() : undefined,
              qty_per_unit: qtyPerUnit,
              total_qty_needed: qtyPerUnit,
              classification_type: this.parseClassification(classification),
            });
          }

          const order: ImportedOrder = {
            so_number: soNumber,
            tools: [{ tool_number: `${soNumber}-1` }],
            line_items: lineItems,
          };

          resolve({ success: true, order, errors, warnings });
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Failed to parse CSV file');
          resolve({ success: false, errors, warnings });
        }
      };

      reader.onerror = () => {
        errors.push('Failed to read file');
        resolve({ success: false, errors, warnings });
      };

      reader.readAsText(file);
    });
  }

  async exportOrderToExcel(order: Order, tools: Tool[], lineItems: LineItemWithPicks[], picks: Pick[]): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Order Info sheet
    const orderInfo = [
      ['SO Number', order.so_number],
      ['PO Number', order.po_number || ''],
      ['Customer', order.customer_name || ''],
      ['Order Date', order.order_date || ''],
      ['Due Date', order.due_date || ''],
      ['Status', order.status],
      ['Notes', order.notes || ''],
    ];
    const orderInfoSheet = XLSX.utils.aoa_to_sheet(orderInfo);
    XLSX.utils.book_append_sheet(workbook, orderInfoSheet, 'Order Info');

    // Parts sheet
    const partsHeader = ['Part Number', 'Description', 'Location', 'Qty/Unit', 'Total Needed', 'Total Picked', 'Remaining'];
    const partsData = lineItems.map(item => [
      item.part_number,
      item.description || '',
      item.location || '',
      item.qty_per_unit,
      item.total_qty_needed,
      item.total_picked,
      item.remaining,
    ]);
    const partsSheet = XLSX.utils.aoa_to_sheet([partsHeader, ...partsData]);
    XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');

    // Tools sheet
    const toolsHeader = ['Tool Number', 'Serial Number', 'Status'];
    const toolsData = tools.map(tool => [
      tool.tool_number,
      tool.serial_number || '',
      tool.status,
    ]);
    const toolsSheet = XLSX.utils.aoa_to_sheet([toolsHeader, ...toolsData]);
    XLSX.utils.book_append_sheet(workbook, toolsSheet, 'Tools');

    // Download
    XLSX.writeFile(workbook, `SO-${order.so_number}.xlsx`);
  }

  async exportOrdersSummaryToExcel(orders: OrderWithProgress[]): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const header = ['SO Number', 'PO Number', 'Customer', 'Status', 'Tools', 'Total Parts', 'Picked', 'Progress %', 'Order Date', 'Due Date'];
    const data = orders.map(order => [
      order.so_number,
      order.po_number || '',
      order.customer_name || '',
      order.status,
      order.tools.length,
      order.total_items,
      order.picked_items,
      order.progress_percent,
      order.order_date || '',
      order.due_date || '',
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Orders');

    XLSX.writeFile(workbook, `Orders-Export-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  async exportItemsToOrderToExcel(items: ItemToOrder[]): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const header = ['Part Number', 'Description', 'Location', 'Qty Available', 'Total Needed', 'Remaining', 'Related Orders'];
    const data = items.map(item => [
      item.part_number,
      item.description || '',
      item.location || '',
      item.qty_available,
      item.total_needed,
      item.remaining,
      item.orders.map(o => `SO-${o.so_number}`).join(', '),
    ]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Items to Order');

    XLSX.writeFile(workbook, `Items-To-Order-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  /**
   * Export pick history to Excel with date range
   */
  async exportPickHistoryToExcel(picks: any[], startDate: string, endDate: string, undos?: any[], activityLogs?: any[]): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Pick History Sheet - includes Status column to show deleted picks
    const header = ['Picked At', 'Picked By', 'SO Number', 'Part Number', 'Tool Number', 'Qty Picked', 'Status', 'Deleted At', 'Deleted By', 'Notes'];
    const data = picks.map(pick => [
      new Date(pick.picked_at).toLocaleString(),
      pick.picked_by || 'Unknown',
      `SO-${pick.so_number}`,
      pick.part_number,
      pick.tool_number,
      pick.qty_picked,
      pick.status || 'Active',
      pick.undone_at ? new Date(pick.undone_at).toLocaleString() : '',
      pick.undone_by || '',
      pick.notes || '',
    ]);

    const picksSheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    XLSX.utils.book_append_sheet(workbook, picksSheet, 'Pick History');

    // Part Totals Sheet - group by part number with total qty picked (only active picks)
    const partTotalsMap = new Map<string, { qty: number; pickCount: number; soNumbers: Set<string> }>();
    for (const pick of picks) {
      // Only count active (non-deleted) picks in totals
      if (pick.status === 'Deleted' || pick.undone_at) continue;

      const existing = partTotalsMap.get(pick.part_number);
      if (existing) {
        existing.qty += pick.qty_picked;
        existing.pickCount += 1;
        existing.soNumbers.add(`SO-${pick.so_number}`);
      } else {
        partTotalsMap.set(pick.part_number, {
          qty: pick.qty_picked,
          pickCount: 1,
          soNumbers: new Set([`SO-${pick.so_number}`]),
        });
      }
    }

    const partTotalsHeader = ['Part Number', 'Total Qty Picked', 'Pick Count', 'SO Numbers'];
    const sortedPartEntries = Array.from(partTotalsMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const partTotalsData = sortedPartEntries.map(([partNumber, data]) => [
      partNumber,
      data.qty,
      data.pickCount,
      Array.from(data.soNumbers).sort().join(', '),
    ]);

    const partTotalsSheet = XLSX.utils.aoa_to_sheet([partTotalsHeader, ...partTotalsData]);
    XLSX.utils.book_append_sheet(workbook, partTotalsSheet, 'Part Totals');

    // Undo History Sheet
    if (undos && undos.length > 0) {
      const undoHeader = ['Undone At', 'Undone By', 'Originally Picked At', 'Originally Picked By', 'SO Number', 'Part Number', 'Tool Number', 'Qty'];
      const undoData = undos.map(undo => [
        new Date(undo.undone_at).toLocaleString(),
        undo.undone_by || 'Unknown',
        new Date(undo.picked_at).toLocaleString(),
        undo.picked_by || 'Unknown',
        `SO-${undo.so_number}`,
        undo.part_number,
        undo.tool_number,
        undo.qty_picked,
      ]);

      const undoSheet = XLSX.utils.aoa_to_sheet([undoHeader, ...undoData]);
      XLSX.utils.book_append_sheet(workbook, undoSheet, 'Undo History');
    }

    // Activity Log Sheet
    if (activityLogs && activityLogs.length > 0) {
      const activityHeader = ['Timestamp', 'Type', 'Performed By', 'SO Number', 'Part Number', 'Description'];
      const activityData = activityLogs.map((log: any) => [
        new Date(log.created_at).toLocaleString(),
        log.type === 'part_added' ? 'Part Added'
          : log.type === 'part_removed' ? 'Part Removed'
          : log.type === 'order_imported' ? 'Order Imported'
          : log.type,
        log.performed_by || '',
        `SO-${log.so_number}`,
        log.part_number || '',
        log.description || '',
      ]);

      const activitySheet = XLSX.utils.aoa_to_sheet([activityHeader, ...activityData]);
      XLSX.utils.book_append_sheet(workbook, activitySheet, 'Activity Log');
    }

    // Summary Sheet
    const activePicks = picks.filter((p: any) => !p.undone_at && p.status !== 'Deleted');
    const deletedPicks = picks.filter((p: any) => p.undone_at || p.status === 'Deleted');
    const totalPicks = picks.length;
    const activePickCount = activePicks.length;
    const deletedPickCount = deletedPicks.length;
    const totalQty = activePicks.reduce((sum: number, p: any) => sum + p.qty_picked, 0);
    const deletedQty = deletedPicks.reduce((sum: number, p: any) => sum + p.qty_picked, 0);
    const uniqueUsers = new Set(activePicks.map((p: any) => p.picked_by || 'Unknown')).size;
    const uniqueParts = new Set(activePicks.map((p: any) => p.part_number)).size;
    const totalUndos = undos ? undos.length : 0;
    const totalActivityLogs = activityLogs ? activityLogs.length : 0;

    const startFormatted = new Date(startDate).toLocaleDateString();
    const endFormatted = new Date(endDate).toLocaleDateString();

    const summaryData = [
      ['Pick History Report'],
      [],
      ['Date Range', `${startFormatted} - ${endFormatted}`],
      [],
      ['Total Pick Records', totalPicks],
      ['Active Picks', activePickCount],
      ['Deleted Picks', deletedPickCount],
      [],
      ['Total Qty Picked (Active)', totalQty],
      ['Total Qty Deleted', deletedQty],
      ['Unique Users', uniqueUsers],
      ['Unique Parts', uniqueParts],
      ['Total Undos (from pick_undos table)', totalUndos],
      ['Total Activity Log Records', totalActivityLogs],
      [],
      ['Export Date', new Date().toLocaleString()],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Download
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Pick-History-${dateStr}.xlsx`);
  }

  async downloadImportTemplate(type: 'single' | 'multi' | 'single-bom' = 'single'): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    if (type === 'single') {
      // Order Info sheet
      const orderInfoData = [
        ['Order Information', ''],
        ['', ''],
        ['SO Number', '3137'],
        ['PO Number', 'PO-12345'],
        ['Customer', 'ACME Corporation'],
        ['Tool Qty', '5'],
        ['Tool Model', '230Q'],
        ['Order Date', '2024-01-15'],
        ['Due Date', '2024-02-15'],
      ];
      const orderInfoSheet = XLSX.utils.aoa_to_sheet(orderInfoData);
      XLSX.utils.book_append_sheet(workbook, orderInfoSheet, 'Order Info');

      // Parts sheet
      const partsData = [
        ['Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
        ['ABC-123', 'Widget Assembly', 'A-01', 2, 'assembly'],
        ['DEF-456', 'Spring Kit', 'B-02', 1, 'purchased'],
        ['GHI-789', 'Gasket Set', 'C-03', 4, 'purchased'],
        ['JKL-012', 'Bearing Pack', 'A-05', 2, 'manufactured'],
        ['MNO-345', 'Seal Ring', 'D-01', 3, ''],
      ];
      const partsSheet = XLSX.utils.aoa_to_sheet(partsData);
      partsSheet['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');
    } else if (type === 'single-bom') {
      // Order Info sheet (same as single)
      const orderInfoData = [
        ['Order Information', ''],
        ['', ''],
        ['SO Number', '3137'],
        ['PO Number', 'PO-12345'],
        ['Customer', 'ACME Corporation'],
        ['Tool Qty', '5'],
        ['Tool Model', '230Q'],
        ['Order Date', '2024-01-15'],
        ['Due Date', '2024-02-15'],
      ];
      const orderInfoSheet = XLSX.utils.aoa_to_sheet(orderInfoData);
      XLSX.utils.book_append_sheet(workbook, orderInfoSheet, 'Order Info');

      // Parts sheet with Level column
      const partsData = [
        ['Level', 'Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
        [0, '230Q-TOOL', '230Q Complete Tool Assembly', '', 1, 'assembly'],
        [1, 'FRAME-ASY', 'Frame Sub-Assembly', '', 1, 'assembly'],
        [2, 'ABC-123', 'Frame Plate', 'A-01', 2, 'manufactured'],
        [2, 'DEF-456', 'Frame Bracket', 'B-02', 4, 'purchased'],
        [2, 'GHI-789', 'Frame Bolt Kit', 'C-03', 8, 'purchased'],
        [1, 'MOTOR-ASY', 'Motor Sub-Assembly', '', 1, 'assembly'],
        [2, 'JKL-012', 'Motor Unit', 'A-05', 1, 'purchased'],
        [2, 'MNO-345', 'Motor Mount', 'D-01', 2, 'manufactured'],
        [2, 'PQR-678', 'Wiring Harness', 'D-03', 1, 'purchased'],
        [1, 'STU-901', 'Seal Ring (standalone leaf)', 'E-02', 3, 'purchased'],
      ];
      const partsSheet = XLSX.utils.aoa_to_sheet(partsData);
      partsSheet['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');
    } else {
      // Multi tool type with BOM hierarchy support
      const orderInfoData = [
        ['Order Information', ''],
        ['', ''],
        ['SO Number', '3137'],
        ['PO Number', 'PO-12345'],
        ['Customer', 'ACME Corporation'],
        ['Order Date', '2024-01-15'],
        ['Due Date', '2024-02-15'],
        ['', ''],
        ['Note: Each additional sheet represents a tool type with its own hierarchical BOM', ''],
        ['TIP: Include Level column for assembly hierarchy (0=root, 1=assembly, 2+=parts)', ''],
      ];
      const orderInfoSheet = XLSX.utils.aoa_to_sheet(orderInfoData);
      XLSX.utils.book_append_sheet(workbook, orderInfoSheet, 'Order Info');

      // 230Q Tool Type sheet with hierarchical BOM
      const tool230QData = [
        ['Qty', 'Level', 'Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
        [2, 0, '230Q-TOOL', '230Q Complete Tool Assembly', '', 1, 'assembly'],
        ['', 1, 'FRAME-230Q', '230Q Frame Assembly', '', 1, 'assembly'],
        ['', 2, 'ABC-123', 'Frame Plate', 'A-01', 2, 'manufactured'],
        ['', 2, 'DEF-456', '230Q Spring Kit', 'B-02', 1, 'purchased'],
        ['', 2, 'GHI-789', '230Q Gasket Set', 'C-03', 4, 'purchased'],
        ['', 1, 'QRS-230', '230Q Motor Unit (standalone)', 'E-01', 1, 'purchased'],
      ];
      const tool230QSheet = XLSX.utils.aoa_to_sheet(tool230QData);
      tool230QSheet['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, tool230QSheet, '230Q');

      // 450Q Tool Type sheet with hierarchical BOM
      const tool450QData = [
        ['Qty', 'Level', 'Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
        [1, 0, '450Q-TOOL', '450Q Complete Tool Assembly', '', 1, 'assembly'],
        ['', 1, 'HOUSING-450Q', '450Q Housing Assembly', '', 1, 'assembly'],
        ['', 2, 'ABC-123', 'Housing Base', 'A-01', 1, 'manufactured'],
        ['', 2, 'TUV-450', '450Q Spring Kit', 'B-05', 2, 'purchased'],
        ['', 1, 'WXY-450', '450Q Electronics Module (standalone)', 'C-08', 1, 'purchased'],
        ['', 1, 'ZAB-450', '450Q Mounting Hardware', 'F-01', 2, 'purchased'],
      ];
      const tool450QSheet = XLSX.utils.aoa_to_sheet(tool450QData);
      tool450QSheet['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, tool450QSheet, '450Q');
    }

    // Create Instructions sheet for all template types
    this.createInstructionsSheet(XLSX, workbook);

    // Download
    let filename: string;
    if (type === 'single') filename = 'order-template-single.xlsx';
    else if (type === 'single-bom') filename = 'order-template-bom.xlsx';
    else filename = 'order-template-multi.xlsx';
    XLSX.writeFile(workbook, filename);
  }

  private createInstructionsSheet(XLSX: any, workbook: any): void {
    const instructionsData = [
      ['Import Template Instructions'],
      [''],
      ['SINGLE TOOL TYPE FORMAT'],
      ['========================='],
      ['Use this format when all tools in the order have the same parts list.'],
      [''],
      ['Order Info Sheet:'],
      ['- SO Number: Sales order number (required)'],
      ['- PO Number: Customer purchase order number (optional)'],
      ['- Customer: Customer name (optional)'],
      ['- Tool Qty: Number of tools to create (default: 1)'],
      ['- Tool Model: Model name for all tools (optional)'],
      ['- Order Date: Order date in YYYY-MM-DD format (optional)'],
      ['- Due Date: Due date in YYYY-MM-DD format (optional)'],
      [''],
      ['Parts Sheet:'],
      ['- Part Number: Part number (required)'],
      ['- Description: Part description (optional)'],
      ['- Location: Bin/location code (optional)'],
      ['- Qty/Unit: Quantity needed per tool (required)'],
      [''],
      [''],
      ['MULTIPLE TOOL TYPES FORMAT'],
      ['==========================='],
      ['Use this format when tools in the order have different parts lists.'],
      [''],
      ['Order Info Sheet:'],
      ['- Same as single format, but no Tool Qty or Tool Model fields'],
      [''],
      ['Tool Type Sheets (e.g., "230Q", "450Q"):'],
      ['- Sheet name becomes the tool model'],
      ['- First column "Qty" in first data row = number of tools of this type'],
      ['- Level: (OPTIONAL) Hierarchy depth for BOM structure (0=root, 1=assembly, 2+=parts)'],
      ['- Part Number: Part number (required)'],
      ['- Description: Part description (optional)'],
      ['- Location: Bin/location code (optional)'],
      ['- Qty/Unit: Quantity needed per parent assembly (required)'],
      ['- Classification: assembly, purchased, manufactured (optional)'],
      [''],
      ['Example: Sheet "230Q" with Qty=2 creates tools 3137-1 and 3137-2'],
      ['         Sheet "450Q" with Qty=1 creates tool 3137-3'],
      [''],
      ['ASSEMBLY HIERARCHY IN MULTI-TOOL FORMAT:'],
      ['- Include the Level column to define assembly structure'],
      ['- Assemblies are auto-created in the Parts Catalog during import'],
      ['- Only LEAF parts (no children) are imported for picking'],
      ['- Quantities multiply through hierarchy (same as single-bom)'],
      [''],
      [''],
      ['SINGLE TOOL TYPE WITH BOM HIERARCHY'],
      ['===================================='],
      ['Use this format when your parts list is a multi-level BOM (bill of materials).'],
      ['The importer will extract only leaf parts and multiply quantities through the hierarchy.'],
      [''],
      ['Order Info Sheet:'],
      ['- Same as the single tool type format above'],
      [''],
      ['Parts Sheet:'],
      ['- Level: Hierarchy depth (0 = root, 1 = top assembly, 2+ = sub-parts) (required for BOM)'],
      ['- Part Number: Part number (required)'],
      ['- Description: Part description (optional)'],
      ['- Location: Bin/location code (optional)'],
      ['- Qty/Unit: Quantity per parent assembly (required)'],
      ['- Classification: assembly, purchased, manufactured (optional)'],
      [''],
      ['How it works:'],
      ['- ✅ ASSEMBLIES ARE AUTO-CREATED in the Parts Catalog during import'],
      ['- ✅ Parent-child relationships are automatically established'],
      ['- Only LEAF parts (parts with no children) are imported for picking'],
      ['- Quantities are MULTIPLIED through the hierarchy'],
      ['  Example: Assembly qty 2 x Child qty 3 = 6 effective parts to pick'],
      ['- The top-level assembly (level 1) becomes the "Assembly Group" label'],
      ['- The Level column is optional: if omitted, the sheet works as a flat parts list'],
      [''],
      ['After import:'],
      ['- View assemblies in the Unified Catalog page'],
      ['- Order detail page shows assembly structure with diagram icon'],
      ['- Future orders can reference the same assemblies'],
      [''],
      [''],
      ['LEGACY FORMAT'],
      ['============='],
      ['The importer also supports the legacy format with tool columns:'],
      ['- Single sheet with Part Number, Description, Location columns'],
      ['- Tool-specific columns like "3137-1", "3137-2" for quantities'],
      ['- Tools are created based on column headers'],
      [''],
      [''],
      ['TIPS'],
      ['===='],
      ['- Delete this Instructions sheet before importing (optional)'],
      ['- Part numbers are used to match parts across tool types'],
      ['- Parts with the same part number will be combined'],
      ['- Grey rows in Excel files are automatically skipped'],
    ];

    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instructionsSheet['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  }

  async exportPartNumbersToExcel(partNumbers: string[]): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const header = ['Part Number'];
    const data = partNumbers.map(pn => [pn]);

    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    sheet['!cols'] = [{ wch: 25 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Part Numbers');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `part-numbers-${dateStr}.xlsx`);
  }

  private findValue(row: any, keys: string[]): string | undefined {
    for (const key of keys) {
      for (const rowKey of Object.keys(row)) {
        if (rowKey.toLowerCase().includes(key.toLowerCase())) {
          return row[rowKey];
        }
      }
    }
    return undefined;
  }

  private parseDate(XLSX: typeof import('xlsx'), value: any): string {
    if (!value) return '';
    if (typeof value === 'number') {
      // Excel date serial number
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }
    return '';
  }

  private parseClassification(value: any): 'purchased' | 'manufactured' | null {
    if (!value) return null;
    const normalized = String(value).toLowerCase().trim();

    if (normalized === 'purchased' || normalized === 'purchase' || normalized === 'buy') return 'purchased';
    if (normalized === 'manufactured' || normalized === 'manufacture' || normalized === 'make') return 'manufactured';
    // Note: 'assembly' and 'modified' are handled by is_assembly and is_modified boolean flags, not classification_type

    return null;
  }

  /**
   * Process hierarchical BOM data with Level column to extract:
   * - Only leaf parts (for picking)
   * - Assembly relationships (assembly_group field)
   * - Multiplied quantities through hierarchy
   */
  private processHierarchicalBOM(rows: any[], toolQty: number = 1): ImportedLineItem[] {
    interface HierarchyNode {
      level: number;
      partNumber: string;
      description?: string;
      location?: string;
      qtyPerUnit: number;
      classification?: string;
      children: HierarchyNode[];
      parent?: HierarchyNode;
    }

    const nodes: HierarchyNode[] = [];
    const stack: HierarchyNode[] = []; // Track current path in hierarchy

    // First pass: Build hierarchy tree
    for (const row of rows) {
      const levelValue = this.findValue(row, ['level', 'lvl']);
      if (levelValue === undefined) {
        // No Level column found, treat as flat list
        return this.processFlatBOM(rows, toolQty);
      }

      const level = parseInt(String(levelValue), 10);
      if (isNaN(level)) continue;

      const partNumber = this.findValue(row, ['part', 'part number', 'part_number', 'partnumber', 'pn']);
      if (!partNumber) continue;

      const description = this.findValue(row, ['description', 'desc', 'name']);
      const location = this.findValue(row, ['location', 'loc', 'bin', 'position']);
      const qtyPerUnit = parseInt(this.findValue(row, ['qty', 'quantity', 'qty/unit', 'qty_per_unit']) || '1', 10) || 1;
      const classification = this.findValue(row, ['classification', 'classification_type', 'type', 'class']);

      const node: HierarchyNode = {
        level,
        partNumber: String(partNumber).trim(),
        description: description ? String(description).trim() : undefined,
        location: location ? String(location).trim() : undefined,
        qtyPerUnit,
        classification: classification ? String(classification).trim() : undefined,
        children: [],
      };

      // Pop stack until we find the parent level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      // Attach to parent if exists
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        node.parent = parent;
        parent.children.push(node);
      } else {
        nodes.push(node);
      }

      stack.push(node);
    }

    // Second pass: Extract leaf parts with multiplied quantities and assembly relationships
    const lineItems: ImportedLineItem[] = [];

    const traverse = (node: HierarchyNode, parentPath: string[], accumulatedQty: number) => {
      const currentQty = accumulatedQty * node.qtyPerUnit;
      const currentPath = [...parentPath, node.partNumber];

      if (node.children.length === 0) {
        // Leaf part: Add to line items
        // Assembly group is the immediate parent (level-1 assembly)
        const assemblyGroup = parentPath.length > 0 ? parentPath[parentPath.length - 1] : undefined;

        lineItems.push({
          part_number: node.partNumber,
          description: node.description,
          location: node.location,
          qty_per_unit: currentQty,
          total_qty_needed: currentQty * toolQty,
          assembly_group: assemblyGroup,
          classification_type: this.parseClassification(node.classification),
        });
      } else {
        // Assembly: Recurse into children
        for (const child of node.children) {
          traverse(child, currentPath, currentQty);
        }
      }
    };

    for (const root of nodes) {
      traverse(root, [], 1);
    }

    return lineItems;
  }

  /**
   * Process flat BOM data (no Level column)
   */
  private processFlatBOM(rows: any[], toolQty: number): ImportedLineItem[] {
    const lineItems: ImportedLineItem[] = [];

    for (const row of rows) {
      const partNumber = this.findValue(row, ['part', 'part number', 'part_number', 'partnumber', 'pn']);
      if (!partNumber) continue;

      const description = this.findValue(row, ['description', 'desc', 'name']);
      const location = this.findValue(row, ['location', 'loc', 'bin', 'position']);
      const qtyPerUnit = parseInt(this.findValue(row, ['qty', 'quantity', 'qty/unit', 'qty_per_unit']) || '1', 10) || 1;
      const classification = this.findValue(row, ['classification', 'classification_type', 'type', 'class']);

      lineItems.push({
        part_number: String(partNumber).trim(),
        description: description ? String(description).trim() : undefined,
        location: location ? String(location).trim() : undefined,
        qty_per_unit: qtyPerUnit,
        total_qty_needed: qtyPerUnit * toolQty,
        classification_type: this.parseClassification(classification),
      });
    }

    return lineItems;
  }

  /**
   * Export full backup of all database tables to Excel
   */
  async exportFullBackupToExcel(): Promise<void> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Helper function to fetch all data from a table with pagination
    const fetchAllFromTable = async <T>(tableName: string, columns: string = '*'): Promise<T[]> => {
      const results: T[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await this.supabase.from(tableName)
          .select(columns)
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          results.push(...(data as T[]));
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return results;
    };

    try {
      // Fetch all data from each table
      const [orders, tools, lineItems, picks, issues, partsCatalog, bomTemplates, bomTemplateItems, pickUndos] = await Promise.all([
        fetchAllFromTable<Order>('orders'),
        fetchAllFromTable<Tool>('tools'),
        fetchAllFromTable<any>('line_items'),
        fetchAllFromTable<Pick>('picks'),
        fetchAllFromTable<Issue>('issues'),
        fetchAllFromTable<PartsCatalogItem>('parts_catalog'),
        fetchAllFromTable<BOMTemplate>('bom_templates'),
        fetchAllFromTable<BOMTemplateItem>('bom_template_items'),
        fetchAllFromTable<PickUndo>('pick_undos'),
      ]);

      // Orders sheet
      if (orders.length > 0) {
        const ordersData = orders.map(o => ({
          id: o.id,
          so_number: o.so_number,
          po_number: o.po_number || '',
          customer_name: o.customer_name || '',
          tool_model: o.tool_model || '',
          quantity: o.quantity || '',
          order_date: o.order_date || '',
          due_date: o.due_date || '',
          status: o.status,
          notes: o.notes || '',
          created_at: o.created_at,
          updated_at: o.updated_at,
        }));
        const ordersSheet = XLSX.utils.json_to_sheet(ordersData);
        XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Orders');
      }

      // Tools sheet
      if (tools.length > 0) {
        const toolsData = tools.map(t => ({
          id: t.id,
          order_id: t.order_id,
          tool_number: t.tool_number,
          serial_number: t.serial_number || '',
          tool_model: t.tool_model || '',
          status: t.status,
          created_at: t.created_at,
        }));
        const toolsSheet = XLSX.utils.json_to_sheet(toolsData);
        XLSX.utils.book_append_sheet(workbook, toolsSheet, 'Tools');
      }

      // Line Items sheet
      if (lineItems.length > 0) {
        const lineItemsData = lineItems.map((li: any) => ({
          id: li.id,
          order_id: li.order_id,
          part_number: li.part_number,
          description: li.description || '',
          location: li.location || '',
          qty_per_unit: li.qty_per_unit,
          total_qty_needed: li.total_qty_needed,
          qty_available: li.qty_available ?? '',
          tool_ids: li.tool_ids ? JSON.stringify(li.tool_ids) : '',
          created_at: li.created_at,
        }));
        const lineItemsSheet = XLSX.utils.json_to_sheet(lineItemsData);
        XLSX.utils.book_append_sheet(workbook, lineItemsSheet, 'Line Items');
      }

      // Picks sheet
      if (picks.length > 0) {
        const picksData = picks.map(p => ({
          id: p.id,
          line_item_id: p.line_item_id,
          tool_id: p.tool_id,
          qty_picked: p.qty_picked,
          picked_by: p.picked_by || '',
          notes: p.notes || '',
          picked_at: p.picked_at,
          status: p.undone_at ? 'Deleted' : 'Active',
          undone_at: p.undone_at || '',
          undone_by: p.undone_by || '',
        }));
        const picksSheet = XLSX.utils.json_to_sheet(picksData);
        XLSX.utils.book_append_sheet(workbook, picksSheet, 'Picks');
      }

      // Issues sheet
      if (issues.length > 0) {
        const issuesData = issues.map(i => ({
          id: i.id,
          line_item_id: i.line_item_id,
          order_id: i.order_id,
          issue_type: i.issue_type,
          description: i.description || '',
          reported_by: i.reported_by || '',
          status: i.status,
          created_at: i.created_at,
          resolved_at: i.resolved_at || '',
          resolved_by: i.resolved_by || '',
        }));
        const issuesSheet = XLSX.utils.json_to_sheet(issuesData);
        XLSX.utils.book_append_sheet(workbook, issuesSheet, 'Issues');
      }

      // Parts Catalog sheet
      if (partsCatalog.length > 0) {
        const catalogData = partsCatalog.map(p => ({
          id: p.id,
          part_number: p.part_number,
          description: p.description || '',
          default_location: p.default_location || '',
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
        const catalogSheet = XLSX.utils.json_to_sheet(catalogData);
        XLSX.utils.book_append_sheet(workbook, catalogSheet, 'Parts Catalog');
      }

      // BOM Templates sheet
      if (bomTemplates.length > 0) {
        const templatesData = bomTemplates.map(t => ({
          id: t.id,
          name: t.name,
          tool_model: t.tool_model || '',
          created_at: t.created_at,
          updated_at: t.updated_at,
        }));
        const templatesSheet = XLSX.utils.json_to_sheet(templatesData);
        XLSX.utils.book_append_sheet(workbook, templatesSheet, 'BOM Templates');
      }

      // BOM Template Items sheet
      if (bomTemplateItems.length > 0) {
        const templateItemsData = bomTemplateItems.map(ti => ({
          id: ti.id,
          template_id: ti.template_id,
          part_number: ti.part_number,
          description: ti.description || '',
          location: ti.location || '',
          qty_per_unit: ti.qty_per_unit,
        }));
        const templateItemsSheet = XLSX.utils.json_to_sheet(templateItemsData);
        XLSX.utils.book_append_sheet(workbook, templateItemsSheet, 'BOM Template Items');
      }

      // Pick Undos sheet
      if (pickUndos.length > 0) {
        const pickUndosData = pickUndos.map(pu => ({
          id: pu.id,
          original_pick_id: pu.original_pick_id,
          line_item_id: pu.line_item_id,
          tool_id: pu.tool_id,
          qty_picked: pu.qty_picked,
          picked_by: pu.picked_by || '',
          notes: pu.notes || '',
          picked_at: pu.picked_at,
          part_number: pu.part_number,
          tool_number: pu.tool_number,
          so_number: pu.so_number,
          order_id: pu.order_id,
          undone_by: pu.undone_by,
          undone_at: pu.undone_at,
        }));
        const pickUndosSheet = XLSX.utils.json_to_sheet(pickUndosData);
        XLSX.utils.book_append_sheet(workbook, pickUndosSheet, 'Pick Undos');
      }

      // Add metadata sheet
      const metadataSheet = XLSX.utils.aoa_to_sheet([
        ['Backup Date', new Date().toISOString()],
        ['Application', 'Tool Pick List Tracker'],
        ['Version', '1.0'],
        [''],
        ['Table', 'Record Count'],
        ['Orders', orders.length],
        ['Tools', tools.length],
        ['Line Items', lineItems.length],
        ['Picks', picks.length],
        ['Issues', issues.length],
        ['Parts Catalog', partsCatalog.length],
        ['BOM Templates', bomTemplates.length],
        ['BOM Template Items', bomTemplateItems.length],
        ['Pick Undos', pickUndos.length],
      ]);
      XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');

      // Download
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `ToolPickList-Backup-${dateStr}.xlsx`);

    } catch (error) {
      console.error('Failed to export backup:', error);
      throw error;
    }
  }

  /**
   * Parse enhanced Excel file with legacy tool column support
   * Detects tool columns like "3137-1", "3137-2" for per-tool quantities
   */
  async parseEnhancedExcelFileWithLegacySupport(file: File): Promise<{
    success: boolean;
    order?: ImportedOrder;
    errors: string[];
    warnings: string[];
  }> {
    const XLSX = await import('xlsx');
    return new Promise((resolve) => {
      const reader = new FileReader();
      const errors: string[] = [];
      const warnings: string[] = [];

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          // Check for Order Info sheet
          const orderInfoSheet = workbook.SheetNames.find(
            name => name.toLowerCase().includes('order') || name.toLowerCase().includes('info')
          );

          const partsSheet = workbook.SheetNames.find(
            name => name.toLowerCase() === 'parts' || name.toLowerCase() === 'bom'
          );

          let soNumber = '';
          let poNumber = '';
          let customerName = '';
          let orderDate = '';
          let dueDate = '';
          let toolQty = 1;
          let toolModel = '';

          // Parse Order Info sheet if exists
          if (orderInfoSheet) {
            const sheet = workbook.Sheets[orderInfoSheet];
            const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

            for (const row of json) {
              if (!row || row.length < 2) continue;
              const label = String(row[0] || '').toLowerCase().trim();
              const value = row[1];

              if (label.includes('so') && label.includes('number')) {
                soNumber = String(value || '').trim();
              } else if (label.includes('po') && label.includes('number')) {
                poNumber = String(value || '').trim();
              } else if (label.includes('customer')) {
                customerName = String(value || '').trim();
              } else if (label.includes('order') && label.includes('date')) {
                orderDate = this.parseDate(XLSX, value);
              } else if (label.includes('due') && label.includes('date')) {
                dueDate = this.parseDate(XLSX, value);
              } else if (label.includes('tool') && label.includes('qty')) {
                toolQty = parseInt(String(value || '1'), 10) || 1;
              } else if (label.includes('model')) {
                toolModel = String(value || '').trim();
              }
            }
          }

          // Extract SO number from filename if not found
          if (!soNumber) {
            const match = file.name.match(/SO[-_]?(\d+)/i);
            if (match) {
              soNumber = match[1];
            } else {
              errors.push('Could not determine SO number');
              resolve({ success: false, errors, warnings });
              return;
            }
          }

          // Parse Parts sheet with legacy tool column detection
          const lineItems: ImportedLineItem[] = [];
          const tools: ImportedTool[] = [];
          let detectedToolColumns: string[] = [];

          const sheetToParse = partsSheet || workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetToParse];
          const json = XLSX.utils.sheet_to_json<any>(sheet);

          if (json.length > 0) {
            const firstRow = json[0];
            const headers = Object.keys(firstRow);

            // Detect tool columns (patterns like "3137-1", "3137-2", "SO3137-1")
            const toolColumnPattern = /^(?:SO)?(\d+)-(\d+)$/i;
            for (const header of headers) {
              const match = header.match(toolColumnPattern);
              if (match) {
                detectedToolColumns.push(header);
              }
            }

            // If we found tool columns, use them to create tools
            if (detectedToolColumns.length > 0) {
              warnings.push(`Detected legacy format with ${detectedToolColumns.length} tool columns`);
              toolQty = detectedToolColumns.length;

              for (const toolCol of detectedToolColumns) {
                const match = toolCol.match(toolColumnPattern);
                if (match) {
                  tools.push({
                    tool_number: `${soNumber}-${match[2]}`,
                    tool_model: toolModel || undefined,
                  });
                }
              }
            }
          }

          // If no tool columns found, generate tools normally
          if (tools.length === 0) {
            for (let i = 1; i <= toolQty; i++) {
              tools.push({
                tool_number: `${soNumber}-${i}`,
                tool_model: toolModel || undefined,
              });
            }
          }

          // Parse line items
          for (const row of json) {
            const partNumber = this.findValue(row, ['part', 'part number', 'part_number', 'partnumber', 'pn']);
            if (!partNumber) continue;

            const description = this.findValue(row, ['description', 'desc', 'name']);
            const location = this.findValue(row, ['location', 'loc', 'bin', 'position']);

            // Check if we have tool columns for per-tool quantities
            if (detectedToolColumns.length > 0) {
              // Sum up quantities from all tool columns
              let totalQty = 0;
              const toolQuantities: { [toolNumber: string]: number } = {};

              for (const toolCol of detectedToolColumns) {
                const qty = parseInt(String(row[toolCol] || '0'), 10) || 0;
                if (qty > 0) {
                  totalQty += qty;
                  const match = toolCol.match(/^(?:SO)?(\d+)-(\d+)$/i);
                  if (match) {
                    toolQuantities[`${soNumber}-${match[2]}`] = qty;
                  }
                }
              }

              if (totalQty > 0) {
                lineItems.push({
                  part_number: String(partNumber).trim(),
                  description: description ? String(description).trim() : undefined,
                  location: location ? String(location).trim() : undefined,
                  qty_per_unit: 1, // For legacy format, qty_per_unit is 1
                  total_qty_needed: totalQty,
                });
              }
            } else {
              // Standard format
              const qtyPerUnit = parseInt(this.findValue(row, ['qty', 'quantity', 'qty/unit', 'qty_per_unit']) || '1', 10) || 1;

              lineItems.push({
                part_number: String(partNumber).trim(),
                description: description ? String(description).trim() : undefined,
                location: location ? String(location).trim() : undefined,
                qty_per_unit: qtyPerUnit,
                total_qty_needed: qtyPerUnit * toolQty,
              });
            }
          }

          if (lineItems.length === 0) {
            warnings.push('No line items found in the file');
          }

          const order: ImportedOrder = {
            so_number: soNumber,
            po_number: poNumber || undefined,
            customer_name: customerName || undefined,
            order_date: orderDate || undefined,
            due_date: dueDate || undefined,
            tools,
            line_items: lineItems,
          };

          resolve({ success: true, order, errors, warnings });
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Failed to parse Excel file');
          resolve({ success: false, errors, warnings });
        }
      };

      reader.onerror = () => {
        errors.push('Failed to read file');
        resolve({ success: false, errors, warnings });
      };

      reader.readAsArrayBuffer(file);
    });
  }
}
