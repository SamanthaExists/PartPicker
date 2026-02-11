#!/usr/bin/env node

/**
 * Check all BOM CSVs for parts that have different quantities across BOMs.
 * These are the parts that would have been split into multiple line items.
 */

import { readFileSync } from 'fs';

const CSV_FILES = [
  { file: '230QR-10002_Full_BOM.csv', tool: '3930-1', so: '3930' },
  { file: '230QR-10003_Full_BOM.csv', tool: '3930-2', so: '3930' },
  { file: '230QR-10004_Full_BOM.csv', tool: '3930-3', so: '3930' },
  { file: '230QR-10005_Full_BOM.csv', tool: '3930-4', so: '3930' },
  { file: '230QR-10006_Full_BOM.csv', tool: '3930-5', so: '3930' },
  { file: '230QR-10007_Full_BOM.csv', tool: '3930-6', so: '3930' },
  { file: '230QRV-10008_Full_BOM.csv', tool: '11770-1', so: '11770' },
  { file: '230QRV-10009_Full_BOM.csv', tool: '11770-2', so: '11770' },
];

const BASE_PATH = 'C:\\Users\\JoshCox\\OneDrive - CORVAER\\Documents\\Tool Pick Lists\\';

// Parse a CSV and extract part_number -> qty for leaf parts
function parseCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const parts = new Map();

  for (const line of lines) {
    // CSV format: Level,PartNumber,Type,Qty,Source,UnitCost,TotalCost,...
    const cols = line.split(',');
    if (cols.length < 4) continue;

    const level = parseInt(cols[0]);
    if (isNaN(level)) continue; // Skip header

    const partNumber = cols[1]?.trim();
    const type = cols[2]?.trim();
    const qtyStr = cols[3]?.trim();
    const qty = parseInt(qtyStr);

    if (!partNumber || isNaN(qty)) continue;

    // Only leaf parts (PUR = purchased, not ASM = assembly)
    if (type === 'PUR') {
      // A part can appear multiple times in the same BOM (different sub-assemblies)
      const existing = parts.get(partNumber) || 0;
      parts.set(partNumber, existing + qty);
    }
  }

  return parts;
}

// Group CSVs by SO
const soGroups = new Map();
for (const entry of CSV_FILES) {
  if (!soGroups.has(entry.so)) soGroups.set(entry.so, []);
  soGroups.get(entry.so).push(entry);
}

for (const [so, entries] of soGroups) {
  console.log(`\n=== SO-${so} (${entries.length} BOMs) ===\n`);

  // Parse all CSVs for this SO
  const bomData = [];
  for (const entry of entries) {
    const parts = parseCSV(BASE_PATH + entry.file);
    bomData.push({ ...entry, parts });
  }

  // Find all unique part numbers
  const allParts = new Set();
  for (const bom of bomData) {
    for (const pn of bom.parts.keys()) allParts.add(pn);
  }

  // Check each part for qty differences
  const diffParts = [];
  for (const pn of allParts) {
    const qtys = new Map();
    for (const bom of bomData) {
      const qty = bom.parts.get(pn);
      if (qty !== undefined) {
        qtys.set(bom.tool, qty);
      }
    }

    const uniqueQtys = new Set(qtys.values());
    if (uniqueQtys.size > 1) {
      diffParts.push({ partNumber: pn, qtys });
    }
  }

  if (diffParts.length === 0) {
    console.log('  No parts with different quantities across BOMs.');
  } else {
    console.log(`  ${diffParts.length} part(s) with different quantities:\n`);
    for (const { partNumber, qtys } of diffParts.sort((a, b) => a.partNumber.localeCompare(b.partNumber))) {
      const details = [...qtys.entries()].map(([tool, qty]) => `${tool}:${qty}`).join(', ');
      const total = [...qtys.values()].reduce((s, q) => s + q, 0);
      console.log(`  Part ${partNumber}: ${details}  (total=${total})`);
    }
  }
}
