#!/usr/bin/env node

/**
 * Merge the split 613279 line items into one per SO.
 * Migrates picks from deleted line items to the kept one.
 *
 * Usage:
 *   node scripts/merge-613279.mjs              # Dry run
 *   node scripts/merge-613279.mjs --execute     # Apply changes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SO_NUMBERS = ['3930', '11770'];
const PART_NUMBER = '613279';
const EXECUTE = process.argv.includes('--execute');

async function main() {
  if (EXECUTE) {
    console.log('🔴 EXECUTE MODE\n');
  } else {
    console.log('🟡 DRY RUN\n');
  }

  for (const soNumber of SO_NUMBERS) {
    const { data: order } = await supabase
      .from('orders').select('id').eq('so_number', soNumber).single();
    if (!order) continue;

    const { data: tools } = await supabase
      .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
    const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));

    const { data: items } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids, assembly_group')
      .eq('order_id', order.id).eq('part_number', PART_NUMBER)
      .order('qty_per_unit', { ascending: false }); // Keep the higher-qty one

    if (!items || items.length <= 1) {
      console.log(`SO-${soNumber}: already a single line item, nothing to merge`);
      continue;
    }

    console.log(`SO-${soNumber}: ${items.length} line items for ${PART_NUMBER}`);

    // Keep the first (higher qty), delete the rest and migrate their picks
    const keepItem = items[0];
    const deleteItems = items.slice(1);

    // Calculate correct total from per-tool actual qtys
    let correctTotal = 0;
    for (const li of items) {
      const toolCount = li.tool_ids ? li.tool_ids.length : tools.length;
      correctTotal += li.qty_per_unit * toolCount;
    }

    const minQty = Math.min(...items.map(li => li.qty_per_unit));

    console.log(`  Keep: id=${keepItem.id}, qty_per_unit=${keepItem.qty_per_unit}`);
    console.log(`  Merge total: ${correctTotal}, new qty_per_unit: ${minQty}`);

    for (const del of deleteItems) {
      // Show picks on the item to be deleted
      const { data: picks } = await supabase
        .from('picks').select('id, tool_id, qty_picked').eq('line_item_id', del.id);

      const toolNames = (picks || []).map(p => `${toolMap.get(p.tool_id)}:${p.qty_picked}`).join(', ');
      console.log(`  Delete: id=${del.id}, qty_per_unit=${del.qty_per_unit}, picks=[${toolNames}]`);

      if (EXECUTE && picks && picks.length > 0) {
        // Migrate picks: update line_item_id to point to the kept item
        for (const pick of picks) {
          const { error } = await supabase
            .from('picks')
            .update({ line_item_id: keepItem.id })
            .eq('id', pick.id);

          if (error) {
            console.log(`    ❌ Failed to migrate pick ${pick.id}: ${error.message}`);
          } else {
            console.log(`    Migrated pick ${pick.id} (${toolMap.get(pick.tool_id)}:${pick.qty_picked})`);
          }
        }
      }

      if (EXECUTE) {
        const { error } = await supabase.from('line_items').delete().eq('id', del.id);
        if (error) {
          console.log(`    ❌ Failed to delete: ${error.message}`);
        } else {
          console.log(`    Deleted line item ${del.id}`);
        }
      }
    }

    // Update kept item with merged values
    if (EXECUTE) {
      const { error } = await supabase
        .from('line_items')
        .update({
          qty_per_unit: minQty,
          total_qty_needed: correctTotal,
          tool_ids: null, // All tools need this part
        })
        .eq('id', keepItem.id);

      if (error) {
        console.log(`  ❌ Failed to update kept item: ${error.message}`);
      } else {
        console.log(`  ✓ Updated: qty_per_unit=${minQty}, total=${correctTotal}, tool_ids=null`);
      }
    }

    // Verify final state
    if (EXECUTE) {
      const { data: finalPicks } = await supabase
        .from('picks').select('tool_id, qty_picked').eq('line_item_id', keepItem.id);
      const summary = (finalPicks || []).map(p => `${toolMap.get(p.tool_id)}:${p.qty_picked}`).join(', ');
      const totalPicked = (finalPicks || []).reduce((s, p) => s + p.qty_picked, 0);
      console.log(`  Verify: ${totalPicked}/${correctTotal} picked [${summary}]`);
    }

    console.log();
  }

  if (!EXECUTE) console.log('DRY RUN complete. Run with --execute to apply.');
}

main().catch(console.error);
