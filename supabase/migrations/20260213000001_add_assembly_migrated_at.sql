-- Add tracking column for assembly migration status
-- This tracks when legacy assembly_group text was migrated to structured parts + part_relationships

ALTER TABLE line_items
ADD COLUMN IF NOT EXISTS assembly_migrated_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for quick filtering of migrated vs non-migrated items
CREATE INDEX IF NOT EXISTS idx_line_items_assembly_migrated_at
ON line_items(assembly_migrated_at)
WHERE assembly_migrated_at IS NOT NULL;

-- Update the migration tracking column for items that have been migrated
-- (have both assembly_group text and part_id foreign key populated)
UPDATE line_items
SET assembly_migrated_at = NOW()
WHERE part_id IS NOT NULL
  AND assembly_group IS NOT NULL
  AND assembly_migrated_at IS NULL;

COMMENT ON COLUMN line_items.assembly_migrated_at IS 'Timestamp when legacy assembly_group text was migrated to structured parts catalog';
