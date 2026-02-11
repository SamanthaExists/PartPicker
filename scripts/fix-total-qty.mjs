import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.argv[2];

if (!SUPABASE_KEY) {
  console.error('Usage: node scripts/fix-total-qty.mjs <supabase-anon-key>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Step 1: Diagnostic — find all mismatched line items
  console.log('=== DIAGNOSTIC: Finding line items where total_qty_needed != qty_per_unit * tool_count ===\n');

  // Fetch all active orders with their tools and line items
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, so_number, status, tools(id)')
    .in('status', ['active']);

  if (ordersErr) { console.error('Failed to fetch orders:', ordersErr); return; }

  const mismatched = [];

  for (const order of orders) {
    const toolCount = order.tools?.length || 0;
    if (toolCount === 0) continue;

    const { data: lineItems, error: liErr } = await supabase
      .from('line_items')
      .select('id, part_number, qty_per_unit, total_qty_needed, tool_ids')
      .eq('order_id', order.id);

    if (liErr) { console.error(`Failed to fetch line items for ${order.so_number}:`, liErr); continue; }

    for (const li of lineItems) {
      const effectiveToolCount = (li.tool_ids && li.tool_ids.length > 0)
        ? li.tool_ids.length
        : toolCount;
      const expected = li.qty_per_unit * effectiveToolCount;

      if (li.total_qty_needed !== expected) {
        mismatched.push({
          so_number: order.so_number,
          part_number: li.part_number,
          qty_per_unit: li.qty_per_unit,
          actual: li.total_qty_needed,
          tool_count: effectiveToolCount,
          expected,
          li_id: li.id,
          order_id: order.id,
        });
      }
    }
  }

  if (mismatched.length === 0) {
    console.log('No mismatched line items found. All totals are correct!');
    return;
  }

  console.log(`Found ${mismatched.length} mismatched line items:\n`);
  console.table(mismatched.map(m => ({
    SO: m.so_number,
    Part: m.part_number,
    'Qty/Unit': m.qty_per_unit,
    'Actual Total': m.actual,
    'Tools': m.tool_count,
    'Expected Total': m.expected,
  })));

  // Step 2: Fix using the RPC function
  console.log('\n=== FIXING: Calling recalculate_line_item_totals for affected orders ===\n');

  const affectedOrderIds = [...new Set(mismatched.map(m => m.order_id))];

  for (const orderId of affectedOrderIds) {
    const soNumber = mismatched.find(m => m.order_id === orderId)?.so_number;
    console.log(`Recalculating for order ${soNumber} (${orderId})...`);

    const { error: rpcErr } = await supabase.rpc('recalculate_line_item_totals', {
      target_order_id: orderId,
    });

    if (rpcErr) {
      console.error(`  ERROR: ${rpcErr.message}`);
    } else {
      console.log(`  Done.`);
    }
  }

  // Step 3: Verify
  console.log('\n=== VERIFICATION: Re-checking affected line items ===\n');

  let stillBroken = 0;
  for (const m of mismatched) {
    const { data: li } = await supabase
      .from('line_items')
      .select('total_qty_needed')
      .eq('id', m.li_id)
      .single();

    if (li && li.total_qty_needed !== m.expected) {
      console.log(`  STILL WRONG: ${m.so_number} / ${m.part_number}: got ${li.total_qty_needed}, expected ${m.expected}`);
      stillBroken++;
    }
  }

  if (stillBroken === 0) {
    console.log('All line items now have correct total_qty_needed values!');
  } else {
    console.log(`\n${stillBroken} line items still have incorrect values.`);
  }
}

main().catch(console.error);
