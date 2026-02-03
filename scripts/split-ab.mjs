#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uewypezgyyyfanltoyfv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVld3lwZXpneXl5ZmFubHRveWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDI0NTgsImV4cCI6MjA4NTExODQ1OH0.01oMpnVsWlpJr6P_mqKdpK-q-kEz1E1TEMo4gNn_gLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRY_RUN = process.argv.includes('--dry-run');

async function fetchAllPicks(lineItemIds) {
  // Supabase has a 1000 row default limit, paginate
  const allPicks = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('picks')
      .select('id, line_item_id, tool_id, qty_picked, picked_by, picked_at, notes')
      .in('line_item_id', lineItemIds)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allPicks.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allPicks;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no changes will be made) ===' : '=== LIVE RUN ===');
  console.log();

  // Step 1: Get the existing SO-AB order
  const { data: abOrder, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('so_number', 'AB')
    .single();

  if (orderErr || !abOrder) {
    console.error('Could not find SO-AB:', orderErr);
    return;
  }
  console.log(`Found SO-AB: ${abOrder.id}`);

  // Step 2: Get tools
  const { data: tools, error: toolsErr } = await supabase
    .from('tools')
    .select('*')
    .eq('order_id', abOrder.id)
    .order('tool_number');

  if (toolsErr) throw toolsErr;
  console.log(`Found ${tools.length} tools`);

  const toolsFor20902 = tools.filter(t => ['AB-1', 'AB-2', 'AB-3', 'AB-4'].includes(t.tool_number));
  const toolsFor20567 = tools.filter(t => ['AB-5', 'AB-6', 'AB-7', 'AB-8'].includes(t.tool_number));

  console.log(`Tools for SO-20902: ${toolsFor20902.map(t => t.tool_number).join(', ')}`);
  console.log(`Tools for SO-20567: ${toolsFor20567.map(t => t.tool_number).join(', ')}`);

  if (toolsFor20902.length !== 4 || toolsFor20567.length !== 4) {
    console.error('ERROR: Expected 4 tools per group');
    return;
  }

  // Step 3: Get all line items
  const { data: lineItems, error: liErr } = await supabase
    .from('line_items')
    .select('*')
    .eq('order_id', abOrder.id);

  if (liErr) throw liErr;
  console.log(`Found ${lineItems.length} line items`);

  // Step 4: Get all picks
  const lineItemIds = lineItems.map(li => li.id);
  const allPicks = await fetchAllPicks(lineItemIds);
  console.log(`Found ${allPicks.length} picks total`);

  // Categorize picks by which new order they belong to
  const tool20902Ids = new Set(toolsFor20902.map(t => t.id));
  const tool20567Ids = new Set(toolsFor20567.map(t => t.id));

  const picks20902 = allPicks.filter(p => tool20902Ids.has(p.tool_id));
  const picks20567 = allPicks.filter(p => tool20567Ids.has(p.tool_id));
  console.log(`Picks for SO-20902: ${picks20902.length}`);
  console.log(`Picks for SO-20567: ${picks20567.length}`);

  if (picks20902.length + picks20567.length !== allPicks.length) {
    console.error('ERROR: Some picks don\'t belong to either group!');
    const orphanPicks = allPicks.filter(p => !tool20902Ids.has(p.tool_id) && !tool20567Ids.has(p.tool_id));
    console.error('Orphan picks:', orphanPicks);
    return;
  }

  if (DRY_RUN) {
    console.log('\n=== DRY RUN COMPLETE - No changes made ===');
    console.log('Run without --dry-run to execute the split.');
    return;
  }

  // Step 5: Create new orders
  console.log('\n--- Creating SO-20902 ---');
  const { data: order20902, error: err20902 } = await supabase
    .from('orders')
    .insert({
      so_number: '20902',
      customer_name: 'Airbus Meaulte',
      tool_model: 'A24TM-10003',
      quantity: 4,
      order_date: '2025-10-02',
      due_date: '2025-11-28',
      status: 'active',
    })
    .select()
    .single();

  if (err20902) { console.error('Error creating SO-20902:', err20902); return; }
  console.log(`Created SO-20902: ${order20902.id}`);

  console.log('--- Creating SO-20567 ---');
  const { data: order20567, error: err20567 } = await supabase
    .from('orders')
    .insert({
      so_number: '20567',
      customer_name: 'Airbus Meaulte',
      tool_model: 'A24TM-10004',
      quantity: 4,
      order_date: '2025-09-04',
      due_date: '2025-12-15',
      status: 'active',
    })
    .select()
    .single();

  if (err20567) { console.error('Error creating SO-20567:', err20567); return; }
  console.log(`Created SO-20567: ${order20567.id}`);

  // Step 6: Create duplicate line items for both new orders
  // Map: old line_item_id -> { new20902Id, new20567Id }
  const lineItemMapping = {};

  console.log('\n--- Creating line items for both new orders ---');
  for (const li of lineItems) {
    const newQty = li.qty_per_unit * 4;

    // Build insert object with only columns that have values
    const baseInsert = {
      part_number: li.part_number,
      description: li.description,
      location: li.location,
      qty_per_unit: li.qty_per_unit,
      total_qty_needed: newQty,
    };
    // Only include optional columns if they have values
    if (li.qty_available != null) baseInsert.qty_available = li.qty_available;
    if (li.qty_on_order != null) baseInsert.qty_on_order = li.qty_on_order;

    // Create for SO-20902
    const { data: newLi20902, error: e1 } = await supabase
      .from('line_items')
      .insert({ ...baseInsert, order_id: order20902.id })
      .select('id')
      .single();

    if (e1) { console.error(`Error creating line item ${li.part_number} for 20902:`, e1); return; }

    // Create for SO-20567
    const { data: newLi20567, error: e2 } = await supabase
      .from('line_items')
      .insert({ ...baseInsert, order_id: order20567.id })
      .select('id')
      .single();

    if (e2) { console.error(`Error creating line item ${li.part_number} for 20567:`, e2); return; }

    lineItemMapping[li.id] = {
      new20902Id: newLi20902.id,
      new20567Id: newLi20567.id,
    };
  }
  console.log(`Created ${lineItems.length} line items for each new order (${lineItems.length * 2} total)`);

  // Step 7: Move tools to new orders
  console.log('\n--- Moving tools ---');
  for (const tool of toolsFor20902) {
    const { error } = await supabase
      .from('tools')
      .update({ order_id: order20902.id })
      .eq('id', tool.id);
    if (error) { console.error(`Error moving tool ${tool.tool_number}:`, error); return; }
  }
  console.log('Moved AB-1, AB-2, AB-3, AB-4 to SO-20902');

  for (const tool of toolsFor20567) {
    const { error } = await supabase
      .from('tools')
      .update({ order_id: order20567.id })
      .eq('id', tool.id);
    if (error) { console.error(`Error moving tool ${tool.tool_number}:`, error); return; }
  }
  console.log('Moved AB-5, AB-6, AB-7, AB-8 to SO-20567');

  // Step 8: Reassign picks to new line items
  console.log('\n--- Reassigning picks ---');
  let updated20902 = 0;
  let updated20567 = 0;

  // Process in batches to avoid too many sequential requests
  for (const pick of picks20902) {
    const mapping = lineItemMapping[pick.line_item_id];
    if (!mapping) {
      console.error(`No mapping for line_item_id ${pick.line_item_id} (pick ${pick.id})`);
      return;
    }
    const { error } = await supabase
      .from('picks')
      .update({ line_item_id: mapping.new20902Id })
      .eq('id', pick.id);
    if (error) { console.error(`Error updating pick ${pick.id}:`, error); return; }
    updated20902++;
  }
  console.log(`Updated ${updated20902} picks for SO-20902`);

  for (const pick of picks20567) {
    const mapping = lineItemMapping[pick.line_item_id];
    if (!mapping) {
      console.error(`No mapping for line_item_id ${pick.line_item_id} (pick ${pick.id})`);
      return;
    }
    const { error } = await supabase
      .from('picks')
      .update({ line_item_id: mapping.new20567Id })
      .eq('id', pick.id);
    if (error) { console.error(`Error updating pick ${pick.id}:`, error); return; }
    updated20567++;
  }
  console.log(`Updated ${updated20567} picks for SO-20567`);

  // Step 9: Delete old SO-AB order (cascades to its now-orphaned line items)
  console.log('\n--- Deleting old SO-AB order ---');
  const { error: delErr } = await supabase
    .from('orders')
    .delete()
    .eq('id', abOrder.id);

  if (delErr) { console.error('Error deleting SO-AB:', delErr); return; }
  console.log('Deleted SO-AB');

  // Step 10: Verify
  console.log('\n=== VERIFICATION ===');
  for (const { soNum, orderId } of [
    { soNum: '20902', orderId: order20902.id },
    { soNum: '20567', orderId: order20567.id },
  ]) {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
    const { data: t } = await supabase.from('tools').select('tool_number').eq('order_id', orderId).order('tool_number');
    const { count: liCount } = await supabase.from('line_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId);

    // Count picks for this order's line items
    const { data: lis } = await supabase.from('line_items').select('id').eq('order_id', orderId);
    const liIds = lis?.map(l => l.id) || [];
    let pickCount = 0;
    if (liIds.length > 0) {
      const { count } = await supabase.from('picks').select('id', { count: 'exact', head: true }).in('line_item_id', liIds);
      pickCount = count;
    }

    console.log(`\nSO-${soNum}:`);
    console.log(`  Customer: ${order?.customer_name}`);
    console.log(`  Tool Model: ${order?.tool_model}`);
    console.log(`  Quantity: ${order?.quantity}`);
    console.log(`  Order Date: ${order?.order_date}`);
    console.log(`  Due Date: ${order?.due_date}`);
    console.log(`  Tools: ${t?.map(x => x.tool_number).join(', ')}`);
    console.log(`  Line Items: ${liCount}`);
    console.log(`  Picks: ${pickCount}`);
  }

  console.log('\n=== SPLIT COMPLETE ===');
}

main().catch(console.error);
