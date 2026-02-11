import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uewypezgyyyfanltoyfv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(supabaseUrl, supabaseKey);

const SO_NUMBERS = ['2907', '770', '20902', '20567', '3306'];

const PARTS_TO_ADD = [
  { part_number: '635751', qty: 4 },
  { part_number: '91007005', qty: 2 },
  { part_number: '91815042', qty: 30 },  // NOTE: appears twice in list - also x8
  { part_number: '864964', qty: 2 },
  { part_number: '94235247', qty: 1 },
  { part_number: '634323PT', qty: 22 },
  { part_number: '634357PT', qty: 2 },
  { part_number: '91815104', qty: 4 },
  { part_number: '634396', qty: 2 },
  { part_number: '634809', qty: 1 },
  // { part_number: '91815042', qty: 8 },  // DUPLICATE - skipping, flagged for user
  { part_number: '635138PT', qty: 1 },
  { part_number: '634958', qty: 1 },
];

async function main() {
  // 1. Get the orders
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, so_number, quantity')
    .in('so_number', SO_NUMBERS);

  if (ordersErr) {
    console.error('Error fetching orders:', ordersErr);
    return;
  }

  console.log('\n=== ORDERS ===');
  for (const o of orders) {
    console.log(`  ${o.so_number} -> id: ${o.id}, quantity: ${o.quantity}`);
  }

  // Check if all SOs were found
  const foundSOs = orders.map(o => o.so_number);
  const missingSOs = SO_NUMBERS.filter(so => !foundSOs.includes(so));
  if (missingSOs.length > 0) {
    console.log(`\n  WARNING: Missing SOs: ${missingSOs.join(', ')}`);
  }

  // 2. Get tools for each order to know tool count
  const orderIds = orders.map(o => o.id);
  const { data: tools, error: toolsErr } = await supabase
    .from('tools')
    .select('id, order_id, tool_number')
    .in('order_id', orderIds);

  if (toolsErr) {
    console.error('Error fetching tools:', toolsErr);
    return;
  }

  // Group tools by order_id
  const toolsByOrder = {};
  for (const t of tools) {
    if (!toolsByOrder[t.order_id]) toolsByOrder[t.order_id] = [];
    toolsByOrder[t.order_id].push(t);
  }

  console.log('\n=== TOOLS PER ORDER ===');
  for (const o of orders) {
    const orderTools = toolsByOrder[o.id] || [];
    console.log(`  ${o.so_number}: ${orderTools.length} tools (order.quantity = ${o.quantity})`);
  }

  // 3. Get existing line items for these orders
  const { data: existingItems, error: itemsErr } = await supabase
    .from('line_items')
    .select('id, order_id, part_number')
    .in('order_id', orderIds);

  if (itemsErr) {
    console.error('Error fetching line items:', itemsErr);
    return;
  }

  // Build a set of existing part_number per order_id
  const existingParts = {};  // { order_id: Set<part_number> }
  for (const item of existingItems) {
    if (!existingParts[item.order_id]) existingParts[item.order_id] = new Set();
    existingParts[item.order_id].add(item.part_number);
  }

  // 4. Check which parts already exist and which need adding
  console.log('\n=== CHECKING EXISTING PARTS ===');
  const toInsert = [];
  const skipped = [];

  for (const order of orders) {
    const orderPartsSet = existingParts[order.id] || new Set();
    const toolCount = (toolsByOrder[order.id] || []).length || order.quantity || 1;

    for (const part of PARTS_TO_ADD) {
      if (orderPartsSet.has(part.part_number)) {
        skipped.push({ so_number: order.so_number, part_number: part.part_number });
      } else {
        toInsert.push({
          order_id: order.id,
          part_number: part.part_number,
          description: null,
          location: null,
          qty_per_unit: part.qty,
          total_qty_needed: part.qty * toolCount,
        });
      }
    }
  }

  if (skipped.length > 0) {
    console.log('\n  SKIPPED (already exist):');
    for (const s of skipped) {
      console.log(`    ${s.so_number} - ${s.part_number}`);
    }
  } else {
    console.log('  No parts already exist on these orders.');
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Parts to add: ${toInsert.length}`);
  console.log(`  Parts skipped: ${skipped.length}`);

  if (toInsert.length > 0) {
    console.log('\n  Items to insert:');
    for (const item of toInsert) {
      const so = orders.find(o => o.id === item.order_id)?.so_number;
      console.log(`    ${so} - ${item.part_number} (qty_per_unit: ${item.qty_per_unit}, total: ${item.total_qty_needed})`);
    }
  }

  // DRY RUN - just report, don't insert yet
  console.log('\n=== DRY RUN MODE - No changes made ===');
  console.log('Review above and re-run with --execute to insert.');

  if (process.argv.includes('--execute')) {
    console.log('\n=== EXECUTING INSERTS ===');
    // Insert in batches
    const { data: inserted, error: insertErr } = await supabase
      .from('line_items')
      .insert(toInsert)
      .select();

    if (insertErr) {
      console.error('Error inserting:', insertErr);
      return;
    }

    console.log(`  Successfully inserted ${inserted.length} line items.`);

    // Log to activity_log
    const activityLogs = inserted.map(item => {
      const so = orders.find(o => o.id === item.order_id)?.so_number;
      return {
        type: 'part_added',
        order_id: item.order_id,
        so_number: so,
        part_number: item.part_number,
        description: null,
        performed_by: 'Claude Script',
        details: { qty_per_unit: item.qty_per_unit, total_qty_needed: item.total_qty_needed, source: 'A2 parts batch add' },
      };
    });

    const { error: logErr } = await supabase
      .from('activity_log')
      .insert(activityLogs);

    if (logErr) {
      console.error('Warning: Failed to log activity:', logErr);
    } else {
      console.log(`  Logged ${activityLogs.length} activity entries.`);
    }
  }
}

main().catch(console.error);
