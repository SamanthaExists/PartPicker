#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Delete partially created empty orders (they have no tools/picks since those weren't moved yet)
  for (const soNum of ['20902', '20567']) {
    const { data: order } = await supabase.from('orders').select('id').eq('so_number', soNum).single();
    if (order) {
      console.log(`Deleting partial SO-${soNum}: ${order.id}`);
      const { error } = await supabase.from('orders').delete().eq('id', order.id);
      if (error) console.error(`Error:`, error);
      else console.log(`  Deleted`);
    } else {
      console.log(`SO-${soNum} not found (already clean)`);
    }
  }

  // Verify SO-AB still exists with all its data
  const { data: ab } = await supabase.from('orders').select('id').eq('so_number', 'AB').single();
  if (ab) {
    const { count: toolCount } = await supabase.from('tools').select('id', { count: 'exact', head: true }).eq('order_id', ab.id);
    const { count: liCount } = await supabase.from('line_items').select('id', { count: 'exact', head: true }).eq('order_id', ab.id);
    console.log(`\nSO-AB intact: ${toolCount} tools, ${liCount} line items`);
  } else {
    console.log('\nWARNING: SO-AB not found!');
  }
}

main().catch(console.error);
