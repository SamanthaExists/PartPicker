#!/usr/bin/env node

/**
 * Fix excess picks on SOs 3930 and 11770.
 *
 * Deletes picks where tool_id is NOT in the line item's tool_ids array,
 * meaning the pick was recorded against the wrong line item.
 *
 * Usage:
 *   node scripts/fix-excess-picks.mjs                      # Dry run (all parts)
 *   node scripts/fix-excess-picks.mjs --part 613279         # Dry run (one part)
 *   node scripts/fix-excess-picks.mjs --part 613279 --execute  # Delete excess picks for one part
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];
const EXECUTE = process.argv.includes('--execute');
const PART_IDX = process.argv.indexOf('--part');
const PART_FILTER = PART_IDX !== -1 ? process.argv[PART_IDX + 1] : null;

async function main() {
  if (EXECUTE) {
    console.log('🔴 EXECUTE MODE — excess picks will be DELETED');
  } else {
    console.log('🟡 DRY RUN — no changes will be made (use --execute to apply)');
  }
  if (PART_FILTER) {
    console.log(`Filtering to part: ${PART_FILTER}`);
  }
  console.log();

  const allExcessPicks = [];

  for (const soNumber of SO_NUMBERS) {
    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, so_number')
      .eq('so_number', soNumber)
      .single();

    if (orderErr || !order) {
      console.log(`SO-${soNumber}: not found, skipping`);
      continue;
    }

    // Fetch tools
    const { data: tools } = await supabase
      .from('tools')
      .select('id, tool_number')
      .eq('order_id', order.id)
      .order('tool_number');

    const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));

    // Fetch ALL line items
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids, assembly_group')
      .eq('order_id', order.id);

    // Group by part_number, find multi-line-item parts
    const partGroups = new Map();
    for (const li of lineItems) {
      if (!partGroups.has(li.part_number)) {
        partGroups.set(li.part_number, []);
      }
      partGroups.get(li.part_number).push(li);
    }

    console.log(`--- SO-${soNumber} ---`);

    for (const [partNumber, items] of partGroups) {
      if (items.length <= 1) continue;
      if (PART_FILTER && partNumber !== PART_FILTER) continue;

      for (const li of items) {
        if (li.tool_ids === null) continue; // Shared line items can't have excess picks

        // Fetch picks for this line item
        const { data: picks } = await supabase
          .from('picks')
          .select('id, tool_id, qty_picked, picked_by, picked_at')
          .eq('line_item_id', li.id);

        for (const pick of (picks || [])) {
          if (!li.tool_ids.includes(pick.tool_id)) {
            const toolName = toolMap.get(pick.tool_id) || pick.tool_id;
            allExcessPicks.push({
              soNumber,
              partNumber,
              lineItemId: li.id,
              lineItemQty: li.qty_per_unit,
              allowedTools: li.tool_ids.map(id => toolMap.get(id) || id),
              pickId: pick.id,
              toolId: pick.tool_id,
              toolName,
              qtyPicked: pick.qty_picked,
              pickedBy: pick.picked_by,
              pickedAt: pick.picked_at,
            });
          }
        }
      }
    }
  }

  // Report
  if (allExcessPicks.length === 0) {
    console.log('\nNo excess picks found. Nothing to fix.');
    return;
  }

  console.log(`\nFound ${allExcessPicks.length} excess pick(s) to delete:\n`);

  for (const ep of allExcessPicks) {
    console.log(`  SO-${ep.soNumber} | Part ${ep.partNumber} (qty_per_unit=${ep.lineItemQty})`);
    console.log(`    Allowed tools: [${ep.allowedTools.join(', ')}]`);
    console.log(`    Excess pick: tool=${ep.toolName}, qty=${ep.qtyPicked}, by=${ep.pickedBy}, at=${ep.pickedAt}`);
    console.log(`    Pick ID: ${ep.pickId}`);
    console.log();
  }

  if (!EXECUTE) {
    console.log(`DRY RUN complete. ${allExcessPicks.length} pick(s) would be deleted.`);
    console.log('Run with --execute to apply changes.');
    return;
  }

  // Execute deletions
  console.log('Deleting excess picks...\n');
  let deleted = 0;
  let failed = 0;

  for (const ep of allExcessPicks) {
    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('id', ep.pickId);

    if (error) {
      console.log(`  FAILED to delete pick ${ep.pickId}: ${error.message}`);
      failed++;
    } else {
      console.log(`  Deleted pick ${ep.pickId} (SO-${ep.soNumber}, Part ${ep.partNumber}, tool=${ep.toolName})`);
      deleted++;
    }
  }

  console.log(`\nDone. Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(console.error);
