#!/usr/bin/env node

/**
 * Merge split line items (same part, different qty_per_unit for different tools)
 * into a single line item with the correct combined total.
 *
 * Usage:
 *   node scripts/merge-split-line-items.mjs              # Dry run
 *   node scripts/merge-split-line-items.mjs --execute     # Apply changes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];
const EXECUTE = process.argv.includes('--execute');

async function main() {
  if (EXECUTE) {
    console.log('🔴 EXECUTE MODE — line items will be merged\n');
  } else {
    console.log('🟡 DRY RUN — no changes will be made (use --execute to apply)\n');
  }

  for (const soNumber of SO_NUMBERS) {
    const { data: order } = await supabase
      .from('orders').select('id, so_number').eq('so_number', soNumber).single();
    if (!order) { console.log(`SO-${soNumber}: not found`); continue; }

    const { data: tools } = await supabase
      .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
    const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));
    const allToolIds = new Set(tools.map(t => t.id));

    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, description, location, qty_per_unit, total_qty_needed, qty_available, qty_on_order, tool_ids, assembly_group')
      .eq('order_id', order.id);

    // Group by part_number, find parts with multiple line items with different qtys
    const partGroups = new Map();
    for (const li of lineItems) {
      if (!partGroups.has(li.part_number)) partGroups.set(li.part_number, []);
      partGroups.get(li.part_number).push(li);
    }

    console.log(`--- SO-${soNumber} ---`);

    for (const [partNumber, items] of partGroups) {
      if (items.length <= 1) continue;
      const qtys = new Set(items.map(li => li.qty_per_unit));
      if (qtys.size <= 1) continue; // Same qty — not the split-assembly issue

      // Check if any have picks — only merge unpicked items
      let hasPicks = false;
      for (const li of items) {
        const { count } = await supabase
          .from('picks').select('*', { count: 'exact', head: true }).eq('line_item_id', li.id);
        if (count > 0) {
          hasPicks = true;
          break;
        }
      }

      if (hasPicks) {
        console.log(`  Part ${partNumber}: SKIPPED (has existing picks — use fix-excess-picks.mjs first)`);
        continue;
      }

      // Calculate merged values
      const combinedTotal = items.reduce((sum, li) => sum + li.total_qty_needed, 0);

      // Union of all tool_ids
      const unionToolIds = new Set();
      let hasShared = false;
      for (const li of items) {
        if (!li.tool_ids || li.tool_ids.length === 0) {
          hasShared = true;
        } else {
          for (const tid of li.tool_ids) unionToolIds.add(tid);
        }
      }

      // If union covers all tools or any item was shared, set tool_ids to null
      const coversAllTools = hasShared || unionToolIds.size >= allToolIds.size;
      const mergedToolIds = coversAllTools ? null : [...unionToolIds];
      const applicableToolCount = coversAllTools ? tools.length : unionToolIds.size;

      // Use minimum qty_per_unit (safest — prevents over-picks, user can partial-pick more)
      const minQty = Math.min(...items.map(li => li.qty_per_unit));

      // Keep the first item, delete the rest
      const keepItem = items[0];
      const deleteItems = items.slice(1);

      const toolDisplay = mergedToolIds
        ? mergedToolIds.map(id => toolMap.get(id) || id).join(', ')
        : 'ALL (shared)';

      console.log(`\n  Part ${partNumber} (${items[0].description || ''})`);
      console.log(`    Before: ${items.length} line items — ${items.map(li => `qty=${li.qty_per_unit}×${li.tool_ids ? li.tool_ids.length : 'all'}tools`).join(', ')}`);
      console.log(`    After:  1 line item — qty_per_unit=${minQty}, total_qty_needed=${combinedTotal}, tools=[${toolDisplay}]`);
      console.log(`    Keeping line item ${keepItem.id}, deleting ${deleteItems.length} duplicate(s)`);

      if (EXECUTE) {
        // Update the kept item
        const { error: updateErr } = await supabase
          .from('line_items')
          .update({
            qty_per_unit: minQty,
            total_qty_needed: combinedTotal,
            tool_ids: mergedToolIds,
          })
          .eq('id', keepItem.id);

        if (updateErr) {
          console.log(`    ❌ Failed to update: ${updateErr.message}`);
          continue;
        }

        // Delete the duplicate items
        for (const del of deleteItems) {
          const { error: delErr } = await supabase
            .from('line_items')
            .delete()
            .eq('id', del.id);

          if (delErr) {
            console.log(`    ❌ Failed to delete ${del.id}: ${delErr.message}`);
          } else {
            console.log(`    Deleted duplicate line item ${del.id}`);
          }
        }

        console.log(`    ✓ Merged`);
      }
    }
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN complete. Run with --execute to apply.');
  } else {
    console.log('\nDone.');
  }
}

main().catch(console.error);
