import { createClient } from '@supabase/supabase-js';
import type { Order, Tool, LineItem, Pick, Issue, PartsCatalogItem, BOMTemplate, BOMTemplateItem } from '@/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database type helpers
export type Database = {
  public: {
    Tables: {
      orders: {
        Row: Order;
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Order, 'id' | 'created_at'>>;
      };
      tools: {
        Row: Tool;
        Insert: Omit<Tool, 'id' | 'created_at'>;
        Update: Partial<Omit<Tool, 'id' | 'created_at'>>;
      };
      line_items: {
        Row: LineItem;
        Insert: Omit<LineItem, 'id' | 'created_at'>;
        Update: Partial<Omit<LineItem, 'id' | 'created_at'>>;
      };
      picks: {
        Row: Pick;
        Insert: Omit<Pick, 'id' | 'picked_at'>;
        Update: Partial<Omit<Pick, 'id' | 'picked_at'>>;
      };
      issues: {
        Row: Issue;
        Insert: Omit<Issue, 'id' | 'created_at'>;
        Update: Partial<Omit<Issue, 'id' | 'created_at'>>;
      };
      parts_catalog: {
        Row: PartsCatalogItem;
        Insert: Omit<PartsCatalogItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PartsCatalogItem, 'id' | 'created_at'>>;
      };
      bom_templates: {
        Row: BOMTemplate;
        Insert: Omit<BOMTemplate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<BOMTemplate, 'id' | 'created_at'>>;
      };
      bom_template_items: {
        Row: BOMTemplateItem;
        Insert: Omit<BOMTemplateItem, 'id'>;
        Update: Partial<Omit<BOMTemplateItem, 'id'>>;
      };
    };
  };
};

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

-- Enable Row Level Security (allow all for now - can be tightened later)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access (development)
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tools" ON tools FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE tools;
ALTER PUBLICATION supabase_realtime ADD TABLE line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tools_order_id ON tools(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_order_id ON line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_picks_line_item_id ON picks(line_item_id);
CREATE INDEX IF NOT EXISTS idx_picks_tool_id ON picks(tool_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_line_items_part_number ON line_items(part_number);
`;

// Migration SQL to add qty_available column to existing databases
export const MIGRATION_QTY_AVAILABLE_SQL = `
-- Add qty_available column to line_items table
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS qty_available INTEGER;
`;

// Migration SQL to add qty_on_order column to existing databases
export const MIGRATION_QTY_ON_ORDER_SQL = `
-- Add qty_on_order column to line_items table
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS qty_on_order INTEGER DEFAULT 0;
`;

// Migration SQL to add new columns and tables for enhanced import
export const MIGRATION_ENHANCED_IMPORT_SQL = `
-- Add tool_model column to tools table
ALTER TABLE tools ADD COLUMN IF NOT EXISTS tool_model TEXT;

-- Add tool_ids column to line_items table
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS tool_ids UUID[];

-- Parts Catalog - saved part numbers and descriptions for reuse
CREATE TABLE IF NOT EXISTS parts_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT UNIQUE NOT NULL,
  description TEXT,
  default_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOM Templates - saved bill of materials for quick order creation
CREATE TABLE IF NOT EXISTS bom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tool_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOM Template Items - parts in each template
CREATE TABLE IF NOT EXISTS bom_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES bom_templates(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  description TEXT,
  location TEXT,
  qty_per_unit INTEGER DEFAULT 1
);

-- Enable RLS on new tables
ALTER TABLE parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_template_items ENABLE ROW LEVEL SECURITY;

-- Policies for new tables
CREATE POLICY "Allow all operations on parts_catalog" ON parts_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bom_templates" ON bom_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bom_template_items" ON bom_template_items FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE parts_catalog;
ALTER PUBLICATION supabase_realtime ADD TABLE bom_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE bom_template_items;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_parts_catalog_part_number ON parts_catalog(part_number);
CREATE INDEX IF NOT EXISTS idx_bom_template_items_template_id ON bom_template_items(template_id);
`;
