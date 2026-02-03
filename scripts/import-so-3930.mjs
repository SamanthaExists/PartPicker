#!/usr/bin/env node

/**
 * Import SO-3930 (Sonivision, 6x 230QR tools) into Supabase.
 *
 * Reads 6 BOM CSV files, extracts leaf-only parts (skipping assemblies),
 * merges shared vs tool-specific parts, and inserts into Supabase.
 *
 * Usage: node scripts/import-so-3930.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ORDER_INFO = {
  so_number: '3930',
  customer_name: 'Sonivision',
  order_date: '2025-03-19',
  due_date: '2025-10-17',
  estimated_ship_date: '2026-03-20',
};

const CSV_DIR = path.resolve(__dirname, '../../');

const CSV_TOOL_MAP = [
  { csv: '230QR-10002_Full_BOM.csv', toolNumber: '3930-1', toolModel: '230QR-10002' },
  { csv: '230QR-10003_Full_BOM.csv', toolNumber: '3930-2', toolModel: '230QR-10003' },
  { csv: '230QR-10004_Full_BOM.csv', toolNumber: '3930-3', toolModel: '230QR-10004' },
  { csv: '230QR-10005_Full_BOM.csv', toolNumber: '3930-4', toolModel: '230QR-10005' },
  { csv: '230QR-10006_Full_BOM.csv', toolNumber: '3930-5', toolModel: '230QR-10006' },
  { csv: '230QR-10007_Full_BOM.csv', toolNumber: '3930-6', toolModel: '230QR-10007' },
];

// --- CSV Parsing (mirrors bomParser.ts logic) ---

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseEuropeanNumber(value) {
  if (!value) return 0;
  let cleaned = value.trim();
  // Strip currency symbols/whitespace
  cleaned = cleaned.replace(/[€$£\s]/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    const commaPos = cleaned.lastIndexOf(',');
    const afterComma = cleaned.substring(commaPos + 1);
    if (afterComma.length <= 3 && /^\d+$/.test(afterComma)) {
      cleaned = cleaned.replace(',', '.');
    }
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseBOMCsv(csvText, filename) {
  const warnings = [];
  const lines = csvText.split(/\r?\n/);
  const toolModel = filename.replace(/_Full_BOM\.csv$/i, '').replace(/\.csv$/i, '').trim();

  // Find header row
  let headerIndex = -1;
  let levelCol = -1, partNumberCol = -1, typeCol = -1, qtyCol = -1, descriptionCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.includes('\u03A3')) continue;

    const cells = parseCSVLine(line);
    const lowerCells = cells.map(c => c.toLowerCase().trim());

    const lvlIdx = lowerCells.findIndex(c => c === 'level' || c === 'lvl');
    const pnIdx = lowerCells.findIndex(c =>
      c === 'part number' || c === 'part_number' || c === 'partnumber' ||
      c === 'part no' || c === 'part no.' || c === 'pn' || c === 'ref_pn'
    );

    if (lvlIdx !== -1 && pnIdx !== -1) {
      headerIndex = i;
      levelCol = lvlIdx;
      partNumberCol = pnIdx;
      typeCol = lowerCells.findIndex(c => c === 'type' || c === 'make/buy' || c === 'make_buy');
      qtyCol = lowerCells.findIndex(c =>
        c === 'qty' || c === 'quantity' || c === 'qty per' || c === 'qty/assy' ||
        c === 'qty ea' || c === 'qty needed'
      );
      descriptionCol = lowerCells.findIndex(c =>
        c === 'description' || c === 'desc' || c === 'name' || c === 'part description'
      );
      break;
    }
  }

  if (headerIndex === -1) {
    warnings.push(`Could not find header row in ${filename}`);
    return { toolModel, leafParts: [], warnings };
  }
  if (qtyCol === -1) {
    warnings.push(`No quantity column found in ${filename}`);
    return { toolModel, leafParts: [], warnings };
  }

  // Parse data rows
  const dataRows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.includes('\u03A3')) continue;

    const cells = parseCSVLine(line);
    const levelStr = (cells[levelCol] || '').trim();
    const level = parseInt(levelStr, 10);
    if (isNaN(level)) continue;

    const partNumber = (cells[partNumberCol] || '').trim();
    if (!partNumber) continue;

    const type = typeCol >= 0 ? (cells[typeCol] || '').trim() : '';
    const rawQty = (cells[qtyCol] || '1').trim();
    const qty = parseEuropeanNumber(rawQty);
    const description = descriptionCol >= 0 ? (cells[descriptionCol] || '').trim() : '';

    dataRows.push({ level, partNumber, type, qty, description });
  }

  if (dataRows.length === 0) {
    warnings.push(`No data rows found in ${filename}`);
    return { toolModel, leafParts: [], warnings };
  }

  // Determine leaf parts with effective quantities
  const assemblyStack = new Map();
  const leafParts = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const nextRow = i + 1 < dataRows.length ? dataRows[i + 1] : null;
    const isLeaf = !nextRow || nextRow.level <= row.level;

    // Calculate effective quantity through parent chain
    let parentEffectiveQty = 1;
    for (let lvl = row.level - 1; lvl >= 0; lvl--) {
      const ancestor = assemblyStack.get(lvl);
      if (ancestor) {
        parentEffectiveQty = ancestor.effectiveQty;
        break;
      }
    }

    const effectiveQty = row.qty * parentEffectiveQty;
    assemblyStack.set(row.level, { partNumber: row.partNumber, effectiveQty });

    // Clean up deeper levels
    for (const [lvl] of assemblyStack) {
      if (lvl > row.level) assemblyStack.delete(lvl);
    }

    // Determine assembly group (level 1 ancestor)
    let assemblyGroup = '';
    for (let lvl = 1; lvl >= 0; lvl--) {
      const ancestor = assemblyStack.get(lvl);
      if (ancestor) { assemblyGroup = ancestor.partNumber; break; }
    }
    if (row.level <= 1) assemblyGroup = row.partNumber;

    if (isLeaf) {
      const finalQty = Math.max(1, Math.ceil(effectiveQty));
      leafParts.push({
        partNumber: row.partNumber,
        description: row.description,
        qty: finalQty,
        assemblyGroup,
        type: row.type,
      });
    }
  }

  return { toolModel, leafParts, warnings };
}

// --- Merge BOMs ---

function mergeMultipleBOMs(parsedBOMs) {
  const totalBOMs = parsedBOMs.length;

  // Build per-BOM maps: partNumber -> { qty, assemblyGroup, description }
  const bomMaps = new Map();
  for (const bom of parsedBOMs) {
    const partMap = new Map();
    for (const leaf of bom.leafParts) {
      const existing = partMap.get(leaf.partNumber);
      if (existing) {
        existing.qty += leaf.qty;
      } else {
        partMap.set(leaf.partNumber, {
          qty: leaf.qty,
          assemblyGroup: leaf.assemblyGroup,
          description: leaf.description,
        });
      }
    }
    bomMaps.set(bom.toolModel, partMap);
  }

  // Collect all unique part numbers
  const allPartNumbers = new Set();
  for (const [, partMap] of bomMaps) {
    for (const pn of partMap.keys()) allPartNumbers.add(pn);
  }

  // Determine shared vs tool-specific
  const lineItems = [];
  for (const partNumber of allPartNumbers) {
    const perBOM = [];
    for (const bom of parsedBOMs) {
      const partMap = bomMaps.get(bom.toolModel);
      const info = partMap?.get(partNumber);
      if (info) {
        perBOM.push({ toolModel: bom.toolModel, qty: info.qty, assemblyGroup: info.assemblyGroup, description: info.description });
      }
    }

    // Group by quantity
    const qtyGroups = new Map();
    for (const entry of perBOM) {
      const group = qtyGroups.get(entry.qty) || [];
      group.push(entry);
      qtyGroups.set(entry.qty, group);
    }

    const firstEntry = perBOM[0];
    for (const [qty, group] of qtyGroups) {
      const toolModels = group.map(g => g.toolModel);
      const isShared = toolModels.length === totalBOMs && qtyGroups.size === 1;

      lineItems.push({
        partNumber,
        description: firstEntry.description,
        assemblyGroup: firstEntry.assemblyGroup,
        qtyPerUnit: qty,
        toolModels,
        isShared,
      });
    }
  }

  // Sort: shared first, then by assembly group, then by part number
  lineItems.sort((a, b) => {
    if (a.isShared !== b.isShared) return a.isShared ? -1 : 1;
    const agCmp = a.assemblyGroup.localeCompare(b.assemblyGroup);
    if (agCmp !== 0) return agCmp;
    return a.partNumber.localeCompare(b.partNumber);
  });

  const sharedCount = lineItems.filter(li => li.isShared).length;
  return {
    lineItems,
    stats: { totalParts: lineItems.length, sharedCount, toolSpecificCount: lineItems.length - sharedCount },
  };
}

// --- Fetch parts catalog ---

async function fetchPartsCatalog() {
  const allParts = [];
  let from = 0;
  const pageSize = 1000;
  try {
    while (true) {
      const { data, error } = await supabase
        .from('parts_catalog')
        .select('part_number, description, default_location')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allParts.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  } catch (err) {
    console.log(`  Warning: Could not fetch parts catalog (${err.message}). Proceeding without it.`);
    return [];
  }
  return allParts;
}

// --- Main ---

async function main() {
  console.log('=== SO-3930 Import (Sonivision, 6x 230QR) ===\n');

  // 1. Check if SO-3930 already exists
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('so_number', '3930')
    .maybeSingle();

  if (existingOrder) {
    console.error('ERROR: SO-3930 already exists in the database (id: ' + existingOrder.id + ').');
    console.error('Delete it first if you want to re-import.');
    process.exit(1);
  }

  // 2. Parse all 6 CSV files
  console.log('Parsing BOM CSV files...');
  const parsedBOMs = [];
  const allWarnings = [];

  for (const entry of CSV_TOOL_MAP) {
    const csvPath = path.join(CSV_DIR, entry.csv);
    if (!fs.existsSync(csvPath)) {
      console.error(`ERROR: CSV file not found: ${csvPath}`);
      process.exit(1);
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const parsed = parseBOMCsv(csvText, entry.csv);
    parsedBOMs.push(parsed);
    allWarnings.push(...parsed.warnings);
    console.log(`  ${entry.csv}: ${parsed.leafParts.length} leaf parts`);
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of allWarnings) console.log(`  - ${w}`);
  }

  // 3. Merge BOMs
  console.log('\nMerging BOMs...');
  const merged = mergeMultipleBOMs(parsedBOMs);
  console.log(`  Total line items: ${merged.stats.totalParts}`);
  console.log(`  Shared (all tools): ${merged.stats.sharedCount}`);
  console.log(`  Tool-specific: ${merged.stats.toolSpecificCount}`);

  // 4. Fetch parts catalog for descriptions/locations
  console.log('\nFetching parts catalog...');
  const catalogParts = await fetchPartsCatalog();
  const catalogMap = new Map();
  for (const part of catalogParts) {
    catalogMap.set(part.part_number, part);
  }
  console.log(`  ${catalogParts.length} catalog entries loaded`);

  // 5. Create order
  console.log('\nCreating order...');
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      so_number: ORDER_INFO.so_number,
      customer_name: ORDER_INFO.customer_name,
      order_date: ORDER_INFO.order_date,
      due_date: ORDER_INFO.due_date,
      estimated_ship_date: ORDER_INFO.estimated_ship_date,
      tool_model: '230QR',
      quantity: 6,
      status: 'active',
    })
    .select()
    .single();

  if (orderError) {
    console.error('Failed to create order:', orderError.message);
    process.exit(1);
  }
  console.log(`  Order created: ${orderData.id}`);

  // 6. Create tools
  console.log('\nCreating tools...');
  const toolsToInsert = CSV_TOOL_MAP.map(entry => ({
    order_id: orderData.id,
    tool_number: entry.toolNumber,
    tool_model: entry.toolModel,
    status: 'pending',
  }));

  const { data: toolsData, error: toolsError } = await supabase
    .from('tools')
    .insert(toolsToInsert)
    .select('id, tool_number, tool_model');

  if (toolsError) {
    console.error('Failed to create tools:', toolsError.message);
    process.exit(1);
  }

  // Build lookup: toolModel -> real tool ID
  const toolModelToId = new Map();
  for (const tool of toolsData) {
    toolModelToId.set(tool.tool_model, tool.id);
    console.log(`  ${tool.tool_number} [${tool.tool_model}] -> ${tool.id}`);
  }

  // 7. Create line items (with tool_ids and assembly_group)
  console.log('\nCreating line items...');
  const itemsToInsert = merged.lineItems.map(item => {
    const catalogEntry = catalogMap.get(item.partNumber);
    const description = catalogEntry?.description || item.description || null;
    const location = catalogEntry?.default_location || null;

    // Determine tool_ids: null = shared (all tools), array = tool-specific
    let toolIds = null;
    if (!item.isShared) {
      toolIds = item.toolModels
        .map(model => toolModelToId.get(model))
        .filter(id => id !== undefined);
      if (toolIds.length === 0) toolIds = null;
    }

    const numApplicableTools = toolIds ? toolIds.length : toolsData.length;
    const totalQtyNeeded = item.qtyPerUnit * numApplicableTools;

    return {
      order_id: orderData.id,
      part_number: item.partNumber,
      description,
      location,
      qty_per_unit: item.qtyPerUnit,
      total_qty_needed: totalQtyNeeded,
      tool_ids: toolIds,
      assembly_group: item.assemblyGroup || null,
    };
  });

  // Insert in batches of 100 to stay within Supabase limits
  const BATCH_SIZE = 100;
  let insertedCount = 0;
  for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
    const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
    const { error: itemsError } = await supabase
      .from('line_items')
      .insert(batch);
    if (itemsError) {
      console.error(`Failed to insert line items batch ${i}-${i + batch.length}:`, itemsError.message);
      process.exit(1);
    }
    insertedCount += batch.length;
  }
  console.log(`  ${insertedCount} line items inserted`);

  // 8. Summary
  console.log('\n=== Import Complete ===');
  console.log(`  SO Number: ${ORDER_INFO.so_number}`);
  console.log(`  Customer: ${ORDER_INFO.customer_name}`);
  console.log(`  Order Date: ${ORDER_INFO.order_date}`);
  console.log(`  Due Date: ${ORDER_INFO.due_date}`);
  console.log(`  Est. Ship Date: ${ORDER_INFO.estimated_ship_date}`);
  console.log(`  Tools: ${toolsData.length}`);
  console.log(`  Line Items: ${insertedCount} (${merged.stats.sharedCount} shared, ${merged.stats.toolSpecificCount} tool-specific)`);

  // Check for parts not in catalog
  const missingFromCatalog = merged.lineItems.filter(item => !catalogMap.has(item.partNumber));
  if (missingFromCatalog.length > 0) {
    console.log(`\n  Note: ${missingFromCatalog.length} parts not found in parts catalog (no saved description/location)`);
    for (const item of missingFromCatalog.slice(0, 10)) {
      console.log(`    - ${item.partNumber}: ${item.description || '(no description)'}`);
    }
    if (missingFromCatalog.length > 10) {
      console.log(`    ... and ${missingFromCatalog.length - 10} more`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
