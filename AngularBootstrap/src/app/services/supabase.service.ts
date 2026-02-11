import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl || 'https://placeholder.supabase.co',
      environment.supabaseAnonKey || 'placeholder-key'
    );
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to create a realtime channel
  channel(name: string): RealtimeChannel {
    return this.supabase.channel(name);
  }

  // Helper method for table operations
  from(table: string) {
    return this.supabase.from(table);
  }

  // Helper method for RPC (stored procedures/functions)
  rpc(fn: string, params?: any) {
    return this.supabase.rpc(fn, params);
  }
}

// SQL schema for reference - run this in Supabase SQL editor
export const SCHEMA_SQL = `
-- Sales Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number TEXT NOT NULL UNIQUE,
  po_number TEXT,
  customer_name TEXT,
  order_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'complete', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tools (units being built within an order)
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  tool_number TEXT NOT NULL,
  serial_number TEXT,
  tool_model TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'complete')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Line Items (parts to pick)
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  description TEXT,
  location TEXT,
  qty_per_unit INTEGER NOT NULL,
  total_qty_needed INTEGER NOT NULL,
  qty_available INTEGER,
  tool_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pick Records (actual picks - append-only for conflict-free sync)
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES line_items(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,
  qty_picked INTEGER NOT NULL,
  picked_by TEXT,
  notes TEXT,
  picked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES line_items(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('out_of_stock', 'wrong_part', 'damaged', 'other')),
  description TEXT,
  reported_by TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Parts Catalog
CREATE TABLE IF NOT EXISTS parts_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT UNIQUE NOT NULL,
  description TEXT,
  default_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOM Templates
CREATE TABLE IF NOT EXISTS bom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tool_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOM Template Items
CREATE TABLE IF NOT EXISTS bom_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES bom_templates(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  description TEXT,
  location TEXT,
  qty_per_unit INTEGER DEFAULT 1
);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_template_items ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tools" ON tools FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on issues" ON issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on parts_catalog" ON parts_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bom_templates" ON bom_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bom_template_items" ON bom_template_items FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tools_order_id ON tools(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_order_id ON line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_picks_line_item_id ON picks(line_item_id);
CREATE INDEX IF NOT EXISTS idx_picks_tool_id ON picks(tool_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_line_items_part_number ON line_items(part_number);
CREATE INDEX IF NOT EXISTS idx_issues_order_id ON issues(order_id);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_part_number ON parts_catalog(part_number);
CREATE INDEX IF NOT EXISTS idx_bom_template_items_template_id ON bom_template_items(template_id);
`;
