#!/usr/bin/env node

/**
 * Audit picks for part 613279 on SOs 3930 and 11770.
 *
 * Identifies "excess picks" — picks where the tool_id is NOT in the
 * line item's tool_ids array, meaning the pick was made against the
 * wrong line item (wrong qty tier).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];
const PART_NUMBER = '613279';

async function main() {
  console.log(`=== Audit picks for part ${PART_NUMBER} on SOs ${SO_NUMBERS.join(', ')} ===\n`);

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

    // Fetch tools for this order (for display)
    const { data: tools } = await supabase
      .from('tools')
      .select('id, tool_number')
      .eq('order_id', order.id)
      .order('tool_number');

    const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));

    // Fetch line items for this part
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids, assembly_group')
      .eq('order_id', order.id)
      .eq('part_number', PART_NUMBER);

    if (!lineItems || lineItems.length === 0) {
      console.log(`SO-${soNumber}: no line items for part ${PART_NUMBER}`);
      continue;
    }

    console.log(`\n--- SO-${soNumber} ---`);
    console.log(`Tools: ${tools.map(t => t.tool_number).join(', ')}`);
    console.log(`Line items for ${PART_NUMBER}: ${lineItems.length}`);

    let totalExcess = 0;

    for (const li of lineItems) {
      const toolNames = li.tool_ids
        ? li.tool_ids.map(id => toolMap.get(id) || id).join(', ')
        : 'ALL (shared)';

      console.log(`\n  Line Item: qty_per_unit=${li.qty_per_unit}, total_qty_needed=${li.total_qty_needed}`);
      console.log(`    Assembly: ${li.assembly_group || '(none)'}`);
      console.log(`    Applies to tools: ${toolNames}`);

      // Fetch picks for this line item
      const { data: picks } = await supabase
        .from('picks')
        .select('id, tool_id, qty_picked, picked_by, picked_at')
        .eq('line_item_id', li.id);

      if (!picks || picks.length === 0) {
        console.log(`    Picks: none`);
        continue;
      }

      const correctPicks = [];
      const excessPicks = [];

      for (const pick of picks) {
        const toolName = toolMap.get(pick.tool_id) || pick.tool_id;
        const pickInfo = {
          ...pick,
          tool_name: toolName,
        };

        if (li.tool_ids === null) {
          // Shared line item — all picks are correct
          correctPicks.push(pickInfo);
        } else if (li.tool_ids.includes(pick.tool_id)) {
          correctPicks.push(pickInfo);
        } else {
          excessPicks.push(pickInfo);
        }
      }

      console.log(`    Correct picks: ${correctPicks.length}`);
      for (const p of correctPicks) {
        console.log(`      ✓ ${p.tool_name}: qty=${p.qty_picked} by ${p.picked_by} at ${p.picked_at}`);
      }

      if (excessPicks.length > 0) {
        console.log(`    ** EXCESS picks: ${excessPicks.length} **`);
        for (const p of excessPicks) {
          console.log(`      ✗ ${p.tool_name}: qty=${p.qty_picked} by ${p.picked_by} at ${p.picked_at} [pick_id: ${p.id}]`);
        }
        totalExcess += excessPicks.length;
      }
    }

    console.log(`\n  TOTAL excess picks for ${PART_NUMBER} on SO-${soNumber}: ${totalExcess}`);
  }

  console.log('\n=== Audit complete ===');
}

main().catch(console.error);
