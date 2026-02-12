-- Classification Refactoring: Separate assembly and modification status from classification_type
-- This migration refactors the parts classification system to use boolean flags
-- for assembly and modification status, while simplifying classification_type to only
-- represent whether a part is purchased or manufactured.

-- 1. Add new boolean columns with default FALSE
ALTER TABLE parts
  ADD COLUMN is_assembly BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_modified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add check constraint for mutual exclusivity
-- A part cannot be both an assembly AND a modified part
ALTER TABLE parts
  ADD CONSTRAINT check_not_both_assembly_and_modified
  CHECK (NOT (is_assembly = TRUE AND is_modified = TRUE));

-- 3. Create indexes for filtering performance
CREATE INDEX idx_parts_is_assembly ON parts(is_assembly) WHERE is_assembly = TRUE;
CREATE INDEX idx_parts_is_modified ON parts(is_modified) WHERE is_modified = TRUE;

-- 4. Migrate existing 'assembly' type parts to is_assembly=true with classification_type=null
UPDATE parts
SET
  is_assembly = TRUE,
  classification_type = NULL
WHERE classification_type = 'assembly';

-- 5. Migrate existing 'modified' type parts to is_modified=true
-- Keep their classification_type if it exists (purchased/manufactured), otherwise set to null
UPDATE parts
SET is_modified = TRUE
WHERE classification_type = 'modified';

-- 6. Update the classification_type CHECK constraint to only allow 'purchased'/'manufactured'/null
-- First drop the old constraint
ALTER TABLE parts
  DROP CONSTRAINT IF EXISTS parts_classification_type_check;

-- Then add the new constraint
ALTER TABLE parts
  ADD CONSTRAINT parts_classification_type_check
  CHECK (classification_type IN ('purchased', 'manufactured') OR classification_type IS NULL);

-- Add comments to document the new schema
COMMENT ON COLUMN parts.is_assembly IS 'TRUE if this part is an assembly (built from other parts). Assemblies have children in part_relationships.';
COMMENT ON COLUMN parts.is_modified IS 'TRUE if this part is a modification of another part (base_part_id should be set).';
COMMENT ON COLUMN parts.classification_type IS 'How the part is sourced: purchased (bought as-is) or manufactured (made in-house). NULL if unspecified.';
COMMENT ON CONSTRAINT check_not_both_assembly_and_modified ON parts IS 'A part cannot be both an assembly and a modified part - these are mutually exclusive states.';
