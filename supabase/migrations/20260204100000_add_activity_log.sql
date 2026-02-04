-- Activity Log table for tracking part additions, removals, and order imports
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,          -- 'part_added', 'part_removed', 'order_imported'
  order_id UUID REFERENCES orders(id),
  so_number TEXT NOT NULL,
  part_number TEXT,            -- null for order_imported
  description TEXT,            -- human-readable message
  performed_by TEXT,           -- user name from settings
  details JSONB,               -- extra context (qty, location, tool count, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_activity_log_order_id ON activity_log(order_id);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all operations on activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
