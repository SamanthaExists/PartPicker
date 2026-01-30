import * as XLSX from 'xlsx';

export interface PartListRecord {
  partNumber: string;
  location: string | null;
  qtyAvailable: number;
  qtyOnOrder: number;
  description: string | null;
}

export interface PartListMap {
  // Map of part number -> { location, qtyAvailable, qtyOnOrder, description }
  [partNumber: string]: PartListRecord;
}

interface ParsePartListResult {
  success: boolean;
  partList: PartListMap;
  totalRecords: number;
  uniqueParts: number;
  errors: string[];
}

/**
 * Parse Part List Excel file and return a map of part numbers to their data
 * Expected columns: Product Id, Location(s), Qty Available, Qty On Order, Description
 */
export async function parsePartListFile(file: File): Promise<ParsePartListResult> {
  const errors: string[] = [];

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, partList: {}, totalRecords: 0, uniqueParts: 0, errors: ['No sheets found in workbook'] };
    }

    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: ''
    });

    if (jsonData.length < 2) {
      return { success: false, partList: {}, totalRecords: 0, uniqueParts: 0, errors: ['Sheet has no data rows'] };
    }

    // Detect column indices from header row
    const headerRow = jsonData[0] as string[];
    const columnMap = detectPartListColumns(headerRow);

    if (columnMap.productId === -1) {
      return {
        success: false,
        partList: {},
        totalRecords: 0,
        uniqueParts: 0,
        errors: ['Could not find Product Id column in Part List file. Expected column names: "Product Id", "Part Number"']
      };
    }

    // Parse all records
    const partList: PartListMap = {};
    let totalRecords = 0;

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as unknown[];
      if (!row || row.length === 0) continue;

      // Convert part number to string - handle both numeric and string values from Excel
      const rawPartNumber = row[columnMap.productId];
      const partNumber = rawPartNumber !== null && rawPartNumber !== undefined
        ? String(rawPartNumber).trim()
        : '';
      if (!partNumber) continue;

      const location = columnMap.location !== -1
        ? normalizeString(row[columnMap.location])
        : null;
      const qtyAvailable = parseNumber(row[columnMap.qtyAvailable]);
      const qtyOnOrder = parseNumber(row[columnMap.qtyOnOrder]);
      const description = columnMap.description !== -1
        ? normalizeString(row[columnMap.description])
        : null;

      totalRecords++;

      // Store in map (last occurrence wins if duplicates exist)
      partList[partNumber] = {
        partNumber,
        location,
        qtyAvailable,
        qtyOnOrder,
        description
      };
    }

    return {
      success: true,
      partList,
      totalRecords,
      uniqueParts: Object.keys(partList).length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      partList: {},
      totalRecords: 0,
      uniqueParts: 0,
      errors: [`Failed to parse Part List file: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

interface ColumnMap {
  productId: number;
  location: number;
  qtyAvailable: number;
  qtyOnOrder: number;
  description: number;
}

function detectPartListColumns(headerRow: string[]): ColumnMap {
  const map: ColumnMap = {
    productId: -1,
    location: -1,
    qtyAvailable: -1,
    qtyOnOrder: -1,
    description: -1
  };

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i] || '').toLowerCase().trim();

    // Product Id / Part Number
    if (header.includes('product') && header.includes('id')) {
      map.productId = i;
    } else if (header === 'product id' || header === 'productid' || header === 'part number' || header === 'part_number' || header === 'partnumber') {
      map.productId = i;
    }

    // Location(s)
    if (header === 'location' || header === 'locations' || header === 'location(s)' || header === 'loc' || header === 'bin') {
      map.location = i;
    }

    // Qty Available
    if (header.includes('qty') && header.includes('available')) {
      map.qtyAvailable = i;
    } else if (header === 'qty available' || header === 'qtyavailable' || header === 'available' || header === 'qty avail') {
      map.qtyAvailable = i;
    }

    // Qty On Order
    if (header.includes('qty') && header.includes('order')) {
      map.qtyOnOrder = i;
    } else if (header === 'qty on order' || header === 'qtyonorder' || header === 'on order' || header === 'qty ordered') {
      map.qtyOnOrder = i;
    }

    // Description
    if (header === 'description' || header === 'desc' || header === 'part description') {
      map.description = i;
    }
  }

  return map;
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.max(0, Math.round(num));
  }
  return 0;
}
