#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Find SO-AB
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .ilike('so_number', '%AB%');

  if (ordersError) {
    console.error('Error:', ordersError);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('No orders found matching "AB"');
    const { data: allOrders } = await supabase.from('orders').select('id, so_number, customer_name, tool_model, quantity, status').order('so_number');
    console.log('\nAll orders:');
    allOrders?.forEach(o => console.log(`  SO-${o.so_number} | ${o.customer_name} | ${o.tool_model} | qty: ${o.quantity} | ${o.status}`));
    return;
  }

  for (const order of orders) {
    console.log('=== ORDER ===');
    console.log(JSON.stringify(order, null, 2));

    const { data: tools } = await supabase
      .from('tools')
      .select('*')
      .eq('order_id', order.id)
      .order('tool_number');

    console.log(`\n--- Tools (${tools?.length || 0}) ---`);
    tools?.forEach(t => console.log(`  ${t.tool_number} | id: ${t.id} | model: ${t.tool_model} | status: ${t.status}`));

    const { data: lineItems } = await supabase
      .from('line_items')
      .select('*')
      .eq('order_id', order.id)
      .order('part_number');

    console.log(`\n--- Line Items (${lineItems?.length || 0}) ---`);
    lineItems?.forEach(li => console.log(`  ${li.part_number} | ${li.description} | loc: ${li.location} | qty_per_unit: ${li.qty_per_unit} | total: ${li.total_qty_needed} | avail: ${li.qty_available} | on_order: ${li.qty_on_order} | tool_ids: ${JSON.stringify(li.tool_ids)}`));

    // Get picks via line_item_ids
    if (lineItems && lineItems.length > 0) {
      const lineItemIds = lineItems.map(li => li.id);
      const { data: picks } = await supabase
        .from('picks')
        .select('id, line_item_id, tool_id, qty_picked, picked_by, picked_at, notes')
        .in('line_item_id', lineItemIds);

      console.log(`\n--- Picks (${picks?.length || 0}) ---`);
      if (picks && picks.length > 0) {
        for (const p of picks) {
          const tool = tools?.find(t => t.id === p.tool_id);
          const li = lineItems.find(l => l.id === p.line_item_id);
          console.log(`  ${tool?.tool_number || 'unknown'} | ${li?.part_number || 'unknown'} | qty: ${p.qty_picked} | by: ${p.picked_by} | at: ${p.picked_at}`);
        }
      }
    }
  }
}

main().catch(console.error);
