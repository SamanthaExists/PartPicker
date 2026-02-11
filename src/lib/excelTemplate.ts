import type * as XLSXType from 'xlsx';

type XLSXModule = typeof XLSXType;

/**
 * Generate and download an Excel template for importing orders
 */
export async function downloadImportTemplate(format: 'single' | 'multi' | 'single-bom' = 'single') {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  if (format === 'single') {
    createSingleToolTypeTemplate(XLSX, workbook);
  } else if (format === 'single-bom') {
    createSingleBomTemplate(XLSX, workbook);
  } else {
    createMultiToolTypeTemplate(XLSX, workbook);
  }

  // Create Instructions sheet
  createInstructionsSheet(XLSX, workbook);

  // Download
  let filename: string;
  if (format === 'single') filename = 'order-template-single.xlsx';
  else if (format === 'single-bom') filename = 'order-template-bom.xlsx';
  else filename = 'order-template-multi.xlsx';
  XLSX.writeFile(workbook, filename);
}

function createSingleToolTypeTemplate(XLSX: XLSXModule, workbook: XLSXType.WorkBook) {
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
    ['JKL-012', 'Bearing Pack', 'A-05', 2, 'purchased'],
    ['MNO-345', 'Seal Ring', 'D-01', 3, 'manufactured'],
  ];
  const partsSheet = XLSX.utils.aoa_to_sheet(partsData);

  // Set column widths
  partsSheet['!cols'] = [
    { wch: 15 }, // Part Number
    { wch: 30 }, // Description
    { wch: 12 }, // Location
    { wch: 10 }, // Qty/Unit
    { wch: 15 }, // Classification
  ];

  XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');
}

function createSingleBomTemplate(XLSX: XLSXModule, workbook: XLSXType.WorkBook) {
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

  partsSheet['!cols'] = [
    { wch: 6 },  // Level
    { wch: 18 }, // Part Number
    { wch: 35 }, // Description
    { wch: 12 }, // Location
    { wch: 10 }, // Qty/Unit
    { wch: 15 }, // Classification
  ];

  XLSX.utils.book_append_sheet(workbook, partsSheet, 'Parts');
}

function createMultiToolTypeTemplate(XLSX: XLSXModule, workbook: XLSXType.WorkBook) {
  // Order Info sheet
  const orderInfoData = [
    ['Order Information', ''],
    ['', ''],
    ['SO Number', '3137'],
    ['PO Number', 'PO-12345'],
    ['Customer', 'ACME Corporation'],
    ['Order Date', '2024-01-15'],
    ['Due Date', '2024-02-15'],
    ['', ''],
    ['Note: Each additional sheet represents a tool type with its own BOM', ''],
  ];
  const orderInfoSheet = XLSX.utils.aoa_to_sheet(orderInfoData);
  XLSX.utils.book_append_sheet(workbook, orderInfoSheet, 'Order Info');

  // 230Q Tool Type sheet
  const tool230QData = [
    ['Qty', 'Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
    [2, 'ABC-123', 'Widget Assembly', 'A-01', 2, 'assembly'],
    ['', 'DEF-456', '230Q Spring Kit', 'B-02', 1, 'purchased'],
    ['', 'GHI-789', '230Q Gasket Set', 'C-03', 4, 'purchased'],
    ['', 'QRS-230', '230Q Specific Part', 'E-01', 1, 'manufactured'],
  ];
  const tool230QSheet = XLSX.utils.aoa_to_sheet(tool230QData);
  tool230QSheet['!cols'] = [
    { wch: 6 },  // Qty
    { wch: 15 }, // Part Number
    { wch: 30 }, // Description
    { wch: 12 }, // Location
    { wch: 10 }, // Qty/Unit
    { wch: 15 }, // Classification
  ];
  XLSX.utils.book_append_sheet(workbook, tool230QSheet, '230Q');

  // 450Q Tool Type sheet
  const tool450QData = [
    ['Qty', 'Part Number', 'Description', 'Location', 'Qty/Unit', 'Classification'],
    [1, 'ABC-123', 'Widget Assembly', 'A-01', 2, 'assembly'],
    ['', 'TUV-450', '450Q Spring Kit', 'B-05', 1, 'purchased'],
    ['', 'WXY-450', '450Q Gasket Set', 'C-08', 4, 'purchased'],
    ['', 'ZAB-450', '450Q Specific Part', 'F-01', 2, 'manufactured'],
  ];
  const tool450QSheet = XLSX.utils.aoa_to_sheet(tool450QData);
  tool450QSheet['!cols'] = [
    { wch: 6 },  // Qty
    { wch: 15 }, // Part Number
    { wch: 30 }, // Description
    { wch: 12 }, // Location
    { wch: 10 }, // Qty/Unit
    { wch: 15 }, // Classification
  ];
  XLSX.utils.book_append_sheet(workbook, tool450QSheet, '450Q');
}

function createInstructionsSheet(XLSX: XLSXModule, workbook: XLSXType.WorkBook) {
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
    ['- Classification: purchased, manufactured, assembly, or modified (optional)'],
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
    ['- Part Number: Part number (required)'],
    ['- Description: Part description (optional)'],
    ['- Location: Bin/location code (optional)'],
    ['- Qty/Unit: Quantity needed per tool (required)'],
    ['- Classification: purchased, manufactured, assembly, or modified (optional)'],
    [''],
    ['Example: Sheet "230Q" with Qty=2 creates tools 3137-1 and 3137-2'],
    ['         Sheet "450Q" with Qty=1 creates tool 3137-3'],
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
    ['- Classification: purchased, manufactured, assembly, or modified (optional)'],
    [''],
    ['How it works:'],
    ['- Only LEAF parts (parts with no children) are imported for picking'],
    ['- Quantities are MULTIPLIED through the hierarchy'],
    ['  Example: Assembly qty 2 x Child qty 3 = 6 effective parts to pick'],
    ['- The top-level assembly (level 1) becomes the "Assembly Group" label'],
    ['- The Level column is optional: if omitted, the sheet works as a flat parts list'],
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
