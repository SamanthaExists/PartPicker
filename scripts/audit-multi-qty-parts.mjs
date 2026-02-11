#!/usr/bin/env node

/**
 * Audit ALL parts on SOs 3930 and 11770 for the same excess-pick issue.
 *
 * Finds parts that have multiple line items (different qty tiers) and
 * checks whether any picks were made against the wrong line item
 * (tool_id not in line item's tool_ids array).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];

async function main() {
  console.log(`=== Audit multi-qty parts for excess picks on SOs ${SO_NUMBERS.join(', ')} ===\n`);

  let grandTotalExcess = 0;
  const allAffected = [];

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

    // Fetch ALL line items for this order
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids, assembly_group')
      .eq('order_id', order.id);

    // Group by part_number
    const partGroups = new Map();
    for (const li of lineItems) {
      if (!partGroups.has(li.part_number)) {
        partGroups.set(li.part_number, []);
      }
      partGroups.get(li.part_number).push(li);
    }

    // Find parts with multiple line items (different qty tiers)
    const multiQtyParts = [];
    for (const [partNumber, items] of partGroups) {
      if (items.length > 1) {
        multiQtyParts.push({ partNumber, items });
      }
    }

    console.log(`\n--- SO-${soNumber} ---`);
    console.log(`Tools: ${tools.map(t => t.tool_number).join(', ')}`);
    console.log(`Total line items: ${lineItems.length}`);
    console.log(`Parts with multiple line items: ${multiQtyParts.length}`);

    if (multiQtyParts.length === 0) {
      console.log(`  No multi-qty parts found.`);
      continue;
    }

    let soExcessTotal = 0;

    for (const { partNumber, items } of multiQtyParts) {
      let partExcess = 0;
      const partDetails = [];

      for (const li of items) {
        // Fetch picks for this line item
        const { data: picks } = await supabase
          .from('picks')
          .select('id, tool_id, qty_picked, picked_by, picked_at')
          .eq('line_item_id', li.id);

        const excessPicks = [];
        const correctPicks = [];

        for (const pick of (picks || [])) {
          if (li.tool_ids === null) {
            // Shared line item — all picks are correct
            correctPicks.push(pick);
          } else if (li.tool_ids.includes(pick.tool_id)) {
            correctPicks.push(pick);
          } else {
            excessPicks.push(pick);
          }
        }

        if (excessPicks.length > 0) {
          partExcess += excessPicks.length;
          partDetails.push({ li, correctPicks, excessPicks });
        }
      }

      if (partExcess > 0) {
        const qtys = items.map(li => `qty=${li.qty_per_unit}`).join(', ');
        console.log(`\n  Part ${partNumber} (${qtys}): ${partExcess} excess pick(s)`);

        for (const { li, correctPicks, excessPicks } of partDetails) {
          const toolNames = li.tool_ids
            ? li.tool_ids.map(id => toolMap.get(id) || id).join(', ')
            : 'ALL';

          console.log(`    Line item qty_per_unit=${li.qty_per_unit}, applies to: [${toolNames}]`);
          console.log(`      Correct: ${correctPicks.length}, Excess: ${excessPicks.length}`);

          for (const p of excessPicks) {
            const toolName = toolMap.get(p.tool_id) || p.tool_id;
            console.log(`      ✗ ${toolName}: qty=${p.qty_picked} by ${p.picked_by} at ${p.picked_at} [pick_id: ${p.id}]`);
          }
        }

        soExcessTotal += partExcess;
        allAffected.push({ soNumber, partNumber, excessCount: partExcess });
      }
    }

    if (soExcessTotal === 0) {
      console.log(`\n  No excess picks found on any multi-qty parts.`);
    } else {
      console.log(`\n  SO-${soNumber} total excess picks: ${soExcessTotal}`);
    }

    grandTotalExcess += soExcessTotal;
  }

  // Summary
  console.log(`\n\n=== SUMMARY ===`);
  if (allAffected.length === 0) {
    console.log(`No excess picks found on any multi-qty parts.`);
  } else {
    console.log(`Affected parts:`);
    for (const { soNumber, partNumber, excessCount } of allAffected) {
      console.log(`  SO-${soNumber}, Part ${partNumber}: ${excessCount} excess pick(s)`);
    }
    console.log(`\nGrand total excess picks: ${grandTotalExcess}`);
  }

  console.log('\n=== Audit complete ===');
}

main().catch(console.error);
