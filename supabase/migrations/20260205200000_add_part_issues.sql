-- Part-level issues (inventory discrepancies, location issues, etc.)
-- Unlike line_item issues which are per-order, these are for the part as a whole

CREATE TYPE part_issue_type AS ENUM ('inventory_discrepancy', 'wrong_location', 'damaged', 'other');
CREATE TYPE part_issue_status AS ENUM ('open', 'resolved');

CREATE TABLE part_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT NOT NULL,
  issue_type part_issue_type NOT NULL,
  description TEXT,
  reported_by TEXT,
  status part_issue_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Index for fast lookups by part number
CREATE INDEX idx_part_issues_part_number ON part_issues(part_number);
CREATE INDEX idx_part_issues_status ON part_issues(status);

-- Enable RLS
ALTER TABLE part_issues ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth in this app)
CREATE POLICY "Allow all operations on part_issues" ON part_issues
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE part_issues;
