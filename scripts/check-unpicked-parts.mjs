#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://uewypezgyyyfanltoyfv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg');

for (const so of ['3930', '11770']) {
  const { data: order } = await supabase.from('orders').select('id').eq('so_number', so).single();
  const { data: tools } = await supabase.from('tools').select('id, tool_number').eq('order_id', order.id).order('tool_number');
  const toolMap = new Map(tools.map(t => [t.id, t.tool_number]));

  for (const pn of ['864471', '613278']) {
    const { data: items } = await supabase.from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids')
      .eq('order_id', order.id).eq('part_number', pn);
    if (!items || items.length === 0) continue;

    console.log(`\nSO-${so} Part ${pn}:`);
    for (const li of items) {
      const { data: picks } = await supabase.from('picks').select('tool_id, qty_picked').eq('line_item_id', li.id);
      const totalPicked = (picks || []).reduce((s, p) => s + p.qty_picked, 0);
      const toolNames = li.tool_ids ? li.tool_ids.map(id => toolMap.get(id) || id).join(', ') : 'ALL';
      console.log(`  qty_per_unit=${li.qty_per_unit}, total_needed=${li.total_qty_needed}, picked=${totalPicked}, remaining=${li.total_qty_needed - totalPicked}`);
      console.log(`    tool_ids: [${toolNames}]`);
    }
  }
}
