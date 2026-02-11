#!/usr/bin/env node

/**
 * Check all multi-qty parts on SOs 3930 and 11770 for the same
 * structural issue: parts with multiple line items (different qty tiers)
 * where each line item is limited to specific tools via tool_ids.
 *
 * These parts are vulnerable to over-picking in "all tools" view because
 * both line items are visible for every tool, and a user could pick
 * the wrong one (getting the wrong quantity).
 *
 * Reports which parts have this issue and their current pick status.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];

async function main() {
  console.log(`=== Multi-qty part exposure check for SOs ${SO_NUMBERS.join(', ')} ===\n`);

  for (const soNumber of SO_NUMBERS) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, so_number')
      .eq('so_number', soNumber)
      .single();

    if (!order) { console.log(`SO-${soNumber}: not found`); continue; }

    const { data: tools } = await supabase
      .from('tools')
      .select('id, tool_number')
      .eq('order_id', order.id)
      .order('tool_number');

    const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));

    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, description, qty_per_unit, total_qty_needed, tool_ids, assembly_group')
      .eq('order_id', order.id);

    // Group by part_number
    const partGroups = new Map();
    for (const li of lineItems) {
      if (!partGroups.has(li.part_number)) partGroups.set(li.part_number, []);
      partGroups.get(li.part_number).push(li);
    }

    // Find parts with multiple line items that have different qty_per_unit
    const vulnerable = [];
    for (const [partNumber, items] of partGroups) {
      if (items.length <= 1) continue;

      const qtys = new Set(items.map(li => li.qty_per_unit));
      if (qtys.size <= 1) continue; // Same qty across all line items — not the same issue

      vulnerable.push({ partNumber, items });
    }

    console.log(`--- SO-${soNumber} ---`);
    console.log(`Total line items: ${lineItems.length}`);
    console.log(`Parts with different qty tiers: ${vulnerable.length}\n`);

    for (const { partNumber, items } of vulnerable) {
      const desc = items[0].description || '';
      console.log(`  Part ${partNumber}${desc ? ' — ' + desc : ''}`);

      for (const li of items) {
        const toolNames = li.tool_ids
          ? li.tool_ids.map(id => toolMap.get(id) || '???').join(', ')
          : 'ALL (shared)';

        // Get picks for this line item
        const { data: picks } = await supabase
          .from('picks')
          .select('id, tool_id, qty_picked')
          .eq('line_item_id', li.id);

        const totalPicked = (picks || []).reduce((sum, p) => sum + p.qty_picked, 0);
        const picksByTool = {};
        for (const p of (picks || [])) {
          const tn = toolMap.get(p.tool_id) || '???';
          picksByTool[tn] = (picksByTool[tn] || 0) + p.qty_picked;
        }

        const pickSummary = Object.keys(picksByTool).length > 0
          ? Object.entries(picksByTool).map(([t, q]) => `${t}:${q}`).join(', ')
          : 'none';

        const remaining = li.total_qty_needed - totalPicked;
        const status = remaining <= 0 ? 'COMPLETE' : `${remaining} remaining`;

        console.log(`    qty_per_unit=${li.qty_per_unit}, total_needed=${li.total_qty_needed}, picked=${totalPicked} (${status})`);
        console.log(`      Tools: [${toolNames}]`);
        console.log(`      Picks: ${pickSummary}`);

        // Check for excess picks
        const excessPicks = (picks || []).filter(p => li.tool_ids && !li.tool_ids.includes(p.tool_id));
        if (excessPicks.length > 0) {
          const excessTools = excessPicks.map(p => toolMap.get(p.tool_id) || '???').join(', ');
          console.log(`      ⚠ HAS ${excessPicks.length} EXCESS PICK(S) from: ${excessTools}`);
        }
      }
      console.log();
    }
  }

  console.log('=== Check complete ===');
}

main().catch(console.error);
