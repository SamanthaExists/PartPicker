#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://uewypezgyyyfanltoyfv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg');

// Expected totals from the CSVs
const expected = {
  '3930': { '613278': 6, '613279': 24, '613281': 8, '864471': 14 },
  '11770': { '613279': 9, '613281': 3, '864471': 5 },
};

for (const [so, parts] of Object.entries(expected)) {
  const { data: order } = await supabase.from('orders').select('id').eq('so_number', so).single();
  if (!order) continue;

  console.log(`\n=== SO-${so} ===\n`);
  console.log(`${'Part'.padEnd(10)} ${'Line Items'.padEnd(12)} ${'DB Total'.padEnd(10)} ${'CSV Total'.padEnd(10)} ${'Picked'.padEnd(10)} Status`);
  console.log('-'.repeat(70));

  for (const [pn, csvTotal] of Object.entries(parts)) {
    const { data: items } = await supabase
      .from('line_items')
      .select('id, qty_per_unit, total_qty_needed, tool_ids')
      .eq('order_id', order.id).eq('part_number', pn);

    const dbTotal = (items || []).reduce((s, li) => s + li.total_qty_needed, 0);
    const lineItemCount = (items || []).length;

    let totalPicked = 0;
    for (const li of (items || [])) {
      const { data: picks } = await supabase.from('picks').select('qty_picked').eq('line_item_id', li.id);
      totalPicked += (picks || []).reduce((s, p) => s + p.qty_picked, 0);
    }

    let status = '';
    if (lineItemCount > 1) status += '⚠ STILL SPLIT  ';
    if (dbTotal !== csvTotal) status += `❌ WRONG TOTAL (should be ${csvTotal})  `;
    if (dbTotal === csvTotal && lineItemCount === 1) status += '✓ OK';

    console.log(`${pn.padEnd(10)} ${String(lineItemCount).padEnd(12)} ${String(dbTotal).padEnd(10)} ${String(csvTotal).padEnd(10)} ${String(totalPicked).padEnd(10)} ${status}`);
  }
}
