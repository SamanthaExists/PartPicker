#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Check both SOs
  for (const so of ['3930', '11770']) {
    const { data: order } = await supabase
      .from('orders').select('id').eq('so_number', so).single();
    if (!order) { console.log(`SO-${so}: not found`); continue; }

    const { data: tools } = await supabase
      .from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');

    console.log(`\nSO-${so} tools:`);
    for (const t of tools) {
      console.log(`  ${t.tool_number} = ${t.id}`);
    }

    const { data: lineItems } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids')
      .eq('order_id', order.id)
      .eq('part_number', '613279');

    console.log(`\nSO-${so} line items for 613279:`);
    for (const li of lineItems || []) {
      console.log(`  id=${li.id}`);
      console.log(`    qty_per_unit=${li.qty_per_unit}, total=${li.total_qty_needed}`);
      console.log(`    tool_ids=${JSON.stringify(li.tool_ids)}`);
      if (li.tool_ids && li.tool_ids.length > 0) {
        const matchingTools = tools.filter(t => li.tool_ids.includes(t.id));
        console.log(`    → tools: ${matchingTools.map(t => t.tool_number).join(', ')}`);
      } else {
        console.log(`    → tools: ALL (null/empty)`);
      }
    }
  }
}

main().catch(console.error);
