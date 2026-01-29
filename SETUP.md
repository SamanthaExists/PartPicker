# Tool Pick List Tracker - Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Supabase** (for real-time sync)
   - Create a free account at [supabase.com](https://supabase.com)
   - Create a new project
   - Go to the SQL Editor and run the schema (see below)
   - Copy your project URL and anon key from Settings > API

3. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Open in Browser**
   Navigate to http://localhost:5173

## Database Schema

Run this SQL in your Supabase SQL Editor:

```sql
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

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access
CREATE POLICY "Allow all operations on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tools" ON tools FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on line_items" ON line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on picks" ON picks FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE tools;
ALTER PUBLICATION supabase_realtime ADD TABLE line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tools_order_id ON tools(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_order_id ON line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_picks_line_item_id ON picks(line_item_id);
CREATE INDEX IF NOT EXISTS idx_picks_tool_id ON picks(tool_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
```

## Features

- **Dashboard**: Overview of active orders, picking progress, and recent activity
- **Orders**: View, create, and manage sales orders
- **Picking Interface**: Pick parts per tool with real-time sync across devices
- **Partial Picks**: Record partial quantities with notes
- **Consolidated Parts View**: See all parts across all orders grouped by part number
- **Excel Import**: Import existing SO-*.xlsx files
- **Real-time Sync**: Multiple users can pick simultaneously with instant updates

## Deployment

### Current Production Setup
The app is deployed to **Netlify** with automatic builds from GitHub:
- **Live URL**: https://partpick.netlify.app
- **Admin**: https://app.netlify.com/projects/partpick

### Deploy to Netlify (Current Setup)
```bash
# Install Netlify CLI (if not installed)
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy to production
netlify deploy --prod
```

### Environment Variables in Netlify
Set these in Netlify Dashboard > Site settings > Environment variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

### Alternative: Vercel
```bash
npm install -g vercel
vercel
```

Set the environment variables in Vercel project settings.
