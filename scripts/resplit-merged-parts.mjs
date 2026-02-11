#!/usr/bin/env node

/**
 * Re-split merged line items back into separate line items per qty group.
 *
 * The previous merge set qty_per_unit = min(qtys) across all tools, which
 * lost per-tool quantity info. This script reads the original BOM CSVs to
 * determine the correct per-tool quantities and creates properly split
 * line items with tool_ids.
 *
 * Usage:
 *   node scripts/resplit-merged-parts.mjs              # Dry run
 *   node scripts/resplit-merged-parts.mjs --execute     # Apply changes
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BASE_PATH = 'C:\\Users\\JoshCox\\OneDrive - CORVAER\\Documents\\Tool Pick Lists\\';
const EXECUTE = process.argv.includes('--execute');

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

    if (type === 'PUR') {
      const existing = parts.get(partNumber) || 0;
      parts.set(partNumber, existing + qty);
    }
  }

  return parts;
}

async function main() {
  if (EXECUTE) {
    console.log('EXECUTE MODE - changes will be applied\n');
  } else {
    console.log('DRY RUN - no changes (use --execute to apply)\n');
  }

  // Group CSV files by SO
  const soGroups = new Map();
  for (const entry of CSV_FILES) {
    if (!soGroups.has(entry.so)) soGroups.set(entry.so, []);
    soGroups.get(entry.so).push(entry);
  }

  for (const [so, entries] of soGroups) {
    console.log(`${'='.repeat(70)}`);
    console.log(`SO-${so}`);
    console.log(`${'='.repeat(70)}`);

    // Fetch order and tools from DB
    const { data: order } = await supabase
      .from('orders').select('id').eq('so_number', so).single();
    if (!order) { console.log(`  SO-${so}: not found`); continue; }

    const { data: tools } = await supabase
      .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
    const toolNumberToId = new Map(tools.map(t => [t.tool_number, t.id]));
    const toolIdToNumber = new Map(tools.map(t => [t.id, t.tool_number]));

    // Parse all CSVs for this SO: build partNumber -> toolNumber -> qty
    const perToolQty = new Map(); // partNumber -> Map<toolNumber, qty>
    for (const entry of entries) {
      const csvParts = parseCSV(BASE_PATH + entry.file);
      for (const [partNumber, qty] of csvParts) {
        if (!perToolQty.has(partNumber)) perToolQty.set(partNumber, new Map());
        perToolQty.get(partNumber).set(entry.tool, qty);
      }
    }

    // Find parts where qty differs across tools
    const partsToSplit = [];
    for (const [partNumber, toolQtys] of perToolQty) {
      const uniqueQtys = new Set(toolQtys.values());
      if (uniqueQtys.size > 1) {
        partsToSplit.push({ partNumber, toolQtys });
      }
    }

    if (partsToSplit.length === 0) {
      console.log('  No parts need re-splitting.\n');
      continue;
    }

    console.log(`  ${partsToSplit.length} part(s) have different qtys across tools\n`);

    for (const { partNumber, toolQtys } of partsToSplit) {
      // Fetch current line item(s) for this part
      const { data: lineItems } = await supabase
        .from('line_items')
        .select('id, part_number, description, location, qty_per_unit, total_qty_needed, qty_available, qty_on_order, tool_ids, assembly_group')
        .eq('order_id', order.id)
        .eq('part_number', partNumber);

      if (!lineItems || lineItems.length === 0) {
        console.log(`  ${partNumber}: NOT FOUND in DB - skipping`);
        continue;
      }

      if (lineItems.length > 1) {
        console.log(`  ${partNumber}: already has ${lineItems.length} line items - already split? Skipping.`);
        continue;
      }

      const mergedItem = lineItems[0];

      // Group tools by qty
      const qtyGroups = new Map(); // qty -> [toolNumber, ...]
      for (const [toolNumber, qty] of toolQtys) {
        if (!qtyGroups.has(qty)) qtyGroups.set(qty, []);
        qtyGroups.get(qty).push(toolNumber);
      }

      // Sort groups by qty descending (keep highest first = update existing item)
      const sortedGroups = [...qtyGroups.entries()].sort((a, b) => b[0] - a[0]);

      console.log(`  Part ${partNumber} (${mergedItem.description || ''})`);
      console.log(`    Current: qty_per_unit=${mergedItem.qty_per_unit}, total=${mergedItem.total_qty_needed}, tool_ids=${mergedItem.tool_ids ? 'specific' : 'null (all)'}`);
      console.log(`    Splitting into ${sortedGroups.length} groups:`);

      // Fetch existing picks for this line item
      const { data: existingPicks } = await supabase
        .from('picks')
        .select('id, tool_id, qty_picked, picked_by, picked_at')
        .eq('line_item_id', mergedItem.id);

      const picks = existingPicks || [];
      const totalPicked = picks.reduce((s, p) => s + p.qty_picked, 0);
      console.log(`    Existing picks: ${picks.length} records, ${totalPicked} total qty`);

      // Process each group
      const newLineItemIds = new Map(); // toolId -> new line_item_id
      let firstGroup = true;

      for (const [qty, toolNumbers] of sortedGroups) {
        const toolIds = toolNumbers.map(tn => toolNumberToId.get(tn)).filter(Boolean);
        const groupTotal = qty * toolIds.length;

        // Count picks belonging to this group
        const groupPicks = picks.filter(p => toolIds.includes(p.tool_id));
        const groupPickedQty = groupPicks.reduce((s, p) => s + p.qty_picked, 0);

        console.log(`      qty=${qty} x ${toolNumbers.join(', ')} (total=${groupTotal}, picked=${groupPickedQty})${firstGroup ? ' [keep existing]' : ' [new line item]'}`);

        if (firstGroup) {
          // Update the existing line item to be this group
          if (EXECUTE) {
            const { error } = await supabase
              .from('line_items')
              .update({
                qty_per_unit: qty,
                total_qty_needed: groupTotal,
                tool_ids: toolIds,
              })
              .eq('id', mergedItem.id);

            if (error) {
              console.log(`      FAILED to update: ${error.message}`);
              break;
            }
            console.log(`      Updated existing line item ${mergedItem.id}`);
          }

          // Picks for this group stay on the existing line item - no migration needed
          for (const toolId of toolIds) {
            newLineItemIds.set(toolId, mergedItem.id);
          }

          firstGroup = false;
        } else {
          // Create a new line item for this group
          if (EXECUTE) {
            const { data: newItem, error } = await supabase
              .from('line_items')
              .insert({
                order_id: order.id,
                part_number: partNumber,
                description: mergedItem.description,
                location: mergedItem.location,
                qty_per_unit: qty,
                total_qty_needed: groupTotal,
                qty_available: mergedItem.qty_available,
                qty_on_order: mergedItem.qty_on_order,
                tool_ids: toolIds,
                assembly_group: mergedItem.assembly_group,
              })
              .select('id')
              .single();

            if (error) {
              console.log(`      FAILED to insert: ${error.message}`);
              continue;
            }

            console.log(`      Created new line item ${newItem.id}`);

            // Migrate picks belonging to this group's tools
            for (const pick of groupPicks) {
              const { error: migrateErr } = await supabase
                .from('picks')
                .update({ line_item_id: newItem.id })
                .eq('id', pick.id);

              if (migrateErr) {
                console.log(`      FAILED to migrate pick ${pick.id}: ${migrateErr.message}`);
              } else {
                console.log(`      Migrated pick ${pick.id} (${toolIdToNumber.get(pick.tool_id)}:${pick.qty_picked})`);
              }
            }

            for (const toolId of toolIds) {
              newLineItemIds.set(toolId, newItem.id);
            }
          } else {
            // Dry run - show what would happen
            for (const pick of groupPicks) {
              console.log(`      Would migrate pick ${pick.id} (${toolIdToNumber.get(pick.tool_id)}:${pick.qty_picked})`);
            }
          }
        }
      }

      console.log();
    }
  }

  // Verification pass
  if (EXECUTE) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('VERIFICATION');
    console.log(`${'='.repeat(70)}\n`);

    for (const [so, entries] of soGroups) {
      const { data: order } = await supabase
        .from('orders').select('id').eq('so_number', so).single();
      if (!order) continue;

      const { data: tools } = await supabase
        .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
      const toolIdToNumber = new Map(tools.map(t => [t.id, t.tool_number]));

      // Re-parse CSVs
      const perToolQty = new Map();
      for (const entry of entries) {
        const csvParts = parseCSV(BASE_PATH + entry.file);
        for (const [partNumber, qty] of csvParts) {
          if (!perToolQty.has(partNumber)) perToolQty.set(partNumber, new Map());
          perToolQty.get(partNumber).set(entry.tool, qty);
        }
      }

      const partsToCheck = [];
      for (const [partNumber, toolQtys] of perToolQty) {
        const uniqueQtys = new Set(toolQtys.values());
        if (uniqueQtys.size > 1) partsToCheck.push({ partNumber, toolQtys });
      }

      console.log(`SO-${so}:`);

      for (const { partNumber, toolQtys } of partsToCheck) {
        const { data: lineItems } = await supabase
          .from('line_items')
          .select('id, qty_per_unit, total_qty_needed, tool_ids')
          .eq('order_id', order.id)
          .eq('part_number', partNumber);

        const csvTotal = [...toolQtys.values()].reduce((s, q) => s + q, 0);
        const dbTotal = (lineItems || []).reduce((s, li) => s + li.total_qty_needed, 0);

        // Check each tool has correct qty
        let allCorrect = true;
        for (const [toolNumber, expectedQty] of toolQtys) {
          const toolId = [...toolIdToNumber.entries()].find(([, tn]) => tn === toolNumber)?.[0];
          if (!toolId) continue;

          // Find which line item this tool belongs to
          const li = (lineItems || []).find(l =>
            l.tool_ids && l.tool_ids.includes(toolId)
          );

          if (!li) {
            console.log(`    ${partNumber} ${toolNumber}: NO LINE ITEM FOUND`);
            allCorrect = false;
          } else if (li.qty_per_unit !== expectedQty) {
            console.log(`    ${partNumber} ${toolNumber}: WRONG qty_per_unit=${li.qty_per_unit}, expected=${expectedQty}`);
            allCorrect = false;
          }
        }

        if (allCorrect && dbTotal === csvTotal) {
          console.log(`  ${partNumber}: OK (${lineItems.length} line items, total=${dbTotal})`);
        } else if (dbTotal !== csvTotal) {
          console.log(`  ${partNumber}: TOTAL MISMATCH db=${dbTotal} csv=${csvTotal}`);
        }
      }
      console.log();
    }
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN complete. Run with --execute to apply.');
  } else {
    console.log('Done.');
  }
}

main().catch(console.error);
