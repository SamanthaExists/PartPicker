#!/usr/bin/env node

/**
 * Comprehensive audit: compare every part's per-tool quantity in the database
 * against the original BOM CSVs.
 *
 * For each CSV (= one tool), checks:
 * 1. Every CSV part exists in the DB with the correct qty
 * 2. No DB parts are missing from the CSV
 * 3. Per-tool pick amounts don't exceed what the CSV says
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BASE_PATH = 'C:\\Users\\JoshCox\\OneDrive - CORVAER\\Documents\\Tool Pick Lists\\';

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

function parseCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const parts = new Map();

  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 4) continue;

    const level = parseInt(cols[0]);
    if (isNaN(level)) continue;

    const partNumber = cols[1]?.trim();
    const type = cols[2]?.trim();
    const rawQty = parseFloat(cols[3]?.trim());

    if (!partNumber || isNaN(rawQty)) continue;

    // Fractional quantities (e.g. 0.036 kg adhesive) count as 1 unit to pick
    const qty = rawQty > 0 ? Math.max(1, Math.ceil(rawQty)) : 0;

    // Only leaf parts (PUR = purchased)
    if (type === 'PUR') {
      const existing = parts.get(partNumber) || 0;
      parts.set(partNumber, existing + qty);
    }
  }

  return parts;
}

async function main() {
  let totalMismatches = 0;
  let totalMissing = 0;
  let totalExtra = 0;
  let totalPickIssues = 0;
  let totalPartsChecked = 0;

  // Group by SO
  const soGroups = new Map();
  for (const entry of CSV_FILES) {
    if (!soGroups.has(entry.so)) soGroups.set(entry.so, []);
    soGroups.get(entry.so).push(entry);
  }

  for (const [so, entries] of soGroups) {
    const { data: order } = await supabase
      .from('orders').select('id').eq('so_number', so).single();
    if (!order) { console.log(`SO-${so}: not found`); continue; }

    // Fetch all tools
    const { data: tools } = await supabase
      .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
    const toolNumberToId = new Map(tools.map(t => [t.tool_number, t.id]));

    // Fetch all line items
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids')
      .eq('order_id', order.id);

    // Build part -> line items map (a part may have multiple line items with different tool_ids)
    const partToLineItems = new Map();
    for (const li of lineItems) {
      if (!partToLineItems.has(li.part_number)) partToLineItems.set(li.part_number, []);
      partToLineItems.get(li.part_number).push(li);
    }

    // Fetch all picks grouped by line_item_id and tool_id
    const lineItemIds = lineItems.map(li => li.id);
    const { data: allPicks } = await supabase
      .from('picks')
      .select('line_item_id, tool_id, qty_picked')
      .in('line_item_id', lineItemIds);

    // Build: part_number -> tool_id -> total_picked
    const picksByPartAndTool = new Map();
    for (const pick of (allPicks || [])) {
      const li = lineItems.find(l => l.id === pick.line_item_id);
      if (!li) continue;
      if (!picksByPartAndTool.has(li.part_number)) picksByPartAndTool.set(li.part_number, new Map());
      const toolMap = picksByPartAndTool.get(li.part_number);
      const current = toolMap.get(pick.tool_id) || 0;
      toolMap.set(pick.tool_id, current + pick.qty_picked);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`SO-${so} (${entries.length} tools, ${lineItems.length} line items)`);
    console.log(`${'='.repeat(80)}`);

    // Check each CSV/tool
    for (const entry of entries) {
      const csvParts = parseCSV(BASE_PATH + entry.file);
      const toolId = toolNumberToId.get(entry.tool);

      if (!toolId) {
        console.log(`\n  ❌ Tool ${entry.tool}: not found in database!`);
        totalMismatches++;
        continue;
      }

      const toolMismatches = [];
      const toolMissing = [];
      const toolPickIssues = [];

      // Check each CSV part against the DB
      for (const [partNumber, csvQty] of csvParts) {
        totalPartsChecked++;
        const items = partToLineItems.get(partNumber);

        if (!items || items.length === 0) {
          toolMissing.push({ partNumber, csvQty });
          continue;
        }

        // Find the line item that applies to this tool
        // (tool_ids includes this toolId, or tool_ids is null = all tools)
        const lineItem = items.find(li =>
          !li.tool_ids || li.tool_ids.length === 0 || li.tool_ids.includes(toolId)
        );

        if (!lineItem) {
          toolMismatches.push({
            partNumber,
            csvQty,
            dbQty: 'N/A',
            issue: `tool ${entry.tool} not in any line item's tool_ids`,
          });
          continue;
        }

        // Compare qty_per_unit against CSV qty
        if (lineItem.qty_per_unit !== csvQty) {
          toolMismatches.push({
            partNumber,
            csvQty,
            dbQty: lineItem.qty_per_unit,
            issue: `qty mismatch`,
          });
        }

        // Check picks for this tool don't exceed CSV qty
        const toolPicks = picksByPartAndTool.get(partNumber)?.get(toolId) || 0;
        if (toolPicks > csvQty) {
          toolPickIssues.push({
            partNumber,
            csvQty,
            picked: toolPicks,
            overpick: toolPicks - csvQty,
          });
        }
      }

      // Check for DB parts not in this CSV (that should apply to this tool)
      const toolExtra = [];
      for (const li of lineItems) {
        if (!csvParts.has(li.part_number)) {
          // Check if this line item applies to this tool
          const appliesToTool = !li.tool_ids || li.tool_ids.length === 0 || li.tool_ids.includes(toolId);
          if (appliesToTool) {
            toolExtra.push({ partNumber: li.part_number, dbQty: li.qty_per_unit });
          }
        }
      }

      // Report for this tool
      const hasIssues = toolMismatches.length > 0 || toolMissing.length > 0 || toolExtra.length > 0 || toolPickIssues.length > 0;

      if (hasIssues) {
        console.log(`\n  Tool ${entry.tool} (${entry.file}):`);

        for (const m of toolMismatches) {
          console.log(`    ❌ MISMATCH: ${m.partNumber} — CSV qty=${m.csvQty}, DB qty=${m.dbQty} (${m.issue})`);
          totalMismatches++;
        }
        for (const m of toolMissing) {
          console.log(`    ⚠ MISSING FROM DB: ${m.partNumber} — CSV qty=${m.csvQty}`);
          totalMissing++;
        }
        for (const e of toolExtra) {
          console.log(`    ⚠ EXTRA IN DB: ${e.partNumber} — DB qty=${e.dbQty} (not in CSV)`);
          totalExtra++;
        }
        for (const p of toolPickIssues) {
          console.log(`    ❌ OVER-PICKED: ${p.partNumber} — CSV qty=${p.csvQty}, picked=${p.picked} (over by ${p.overpick})`);
          totalPickIssues++;
        }
      } else {
        console.log(`\n  Tool ${entry.tool}: ✓ All ${csvParts.size} parts match`);
      }
    }

    // Cross-tool total check: for each part, sum CSV qtys across all tools and compare to DB total
    console.log(`\n  --- Total quantity check (sum across all tools vs DB total_qty_needed) ---`);
    const allCsvParts = new Map();
    for (const entry of entries) {
      const csvParts = parseCSV(BASE_PATH + entry.file);
      for (const [pn, qty] of csvParts) {
        allCsvParts.set(pn, (allCsvParts.get(pn) || 0) + qty);
      }
    }

    let totalOk = 0;
    let totalBad = 0;
    for (const [partNumber, csvTotal] of allCsvParts) {
      const items = partToLineItems.get(partNumber);
      if (!items || items.length === 0) continue;

      // Sum total_qty_needed across all line items for this part
      const dbTotal = items.reduce((s, li) => s + li.total_qty_needed, 0);

      if (dbTotal !== csvTotal) {
        console.log(`    ❌ ${partNumber}: DB total=${dbTotal}, CSV total=${csvTotal} (diff=${dbTotal - csvTotal})`);
        totalBad++;
      } else {
        totalOk++;
      }
    }
    if (totalBad === 0) {
      console.log(`    ✓ All ${totalOk} part totals match`);
    } else {
      console.log(`    ${totalOk} OK, ${totalBad} mismatched`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log(`Parts checked: ${totalPartsChecked}`);
  console.log(`Qty mismatches: ${totalMismatches}`);
  console.log(`Missing from DB: ${totalMissing}`);
  console.log(`Extra in DB: ${totalExtra}`);
  console.log(`Over-picked: ${totalPickIssues}`);

  if (totalMismatches === 0 && totalMissing === 0 && totalExtra === 0 && totalPickIssues === 0) {
    console.log('\n✓ Everything looks good!');
  } else {
    console.log('\n⚠ Issues found — review above');
  }
}

main().catch(console.error);
