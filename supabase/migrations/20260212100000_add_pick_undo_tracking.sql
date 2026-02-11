-- Add undo tracking columns to picks table
ALTER TABLE picks
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS undone_by TEXT;

-- Create pick_undos audit table for backwards compatibility
CREATE TABLE IF NOT EXISTS pick_undos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_pick_id UUID NOT NULL,
  line_item_id UUID NOT NULL,
  tool_id UUID NOT NULL,
  qty_picked INTEGER NOT NULL,
  picked_by TEXT,
  notes TEXT,
  picked_at TIMESTAMPTZ NOT NULL,
  part_number TEXT NOT NULL,
  tool_number TEXT NOT NULL,
  so_number TEXT NOT NULL,
  order_id UUID NOT NULL,
  undone_by TEXT NOT NULL,
  undone_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE pick_undos ENABLE ROW LEVEL SECURITY;

-- Policy for anonymous access (drop and recreate to ensure it exists)
DROP POLICY IF EXISTS "Allow all operations on pick_undos" ON pick_undos;
CREATE POLICY "Allow all operations on pick_undos" ON pick_undos FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_picks_undone_at ON picks(undone_at);
CREATE INDEX IF NOT EXISTS idx_pick_undos_undone_at ON pick_undos(undone_at);
CREATE INDEX IF NOT EXISTS idx_pick_undos_order_id ON pick_undos(order_id);
CREATE INDEX IF NOT EXISTS idx_pick_undos_part_number ON pick_undos(part_number);

-- Comment explaining the schema
COMMENT ON COLUMN picks.undone_at IS 'Timestamp when this pick was undone/deleted (NULL for active picks)';
COMMENT ON COLUMN picks.undone_by IS 'User who undid/deleted this pick';
COMMENT ON TABLE pick_undos IS 'Audit trail of undone picks - denormalized snapshots for historical reporting';
