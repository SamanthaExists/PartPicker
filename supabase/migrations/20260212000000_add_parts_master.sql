-- Parts Master Catalog and Hierarchical Relationships
-- Adds part classification, assembly BOMs, and modification tracking

-- 1. Parts Master Table
-- Central catalog of all parts with optional classification
CREATE TABLE parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT NOT NULL UNIQUE,
  description TEXT,
  classification_type TEXT CHECK (classification_type IN ('purchased', 'manufactured', 'assembly', 'modified')),
  default_location TEXT,
  base_part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parts_part_number ON parts(part_number);
CREATE INDEX idx_parts_classification ON parts(classification_type);
CREATE INDEX idx_parts_base_part ON parts(base_part_id);

-- 2. Part Relationships Table
-- Defines assembly bill of materials (parent-child relationships)
CREATE TABLE part_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  child_part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
  reference_designator TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_parent_child UNIQUE (parent_part_id, child_part_id),
  CONSTRAINT no_self_reference CHECK (parent_part_id != child_part_id)
);

CREATE INDEX idx_part_relationships_parent ON part_relationships(parent_part_id);
CREATE INDEX idx_part_relationships_child ON part_relationships(child_part_id);

-- 3. Add optional part_id to existing tables (loose coupling for gradual migration)
ALTER TABLE line_items
  ADD COLUMN part_id UUID REFERENCES parts(id) ON DELETE SET NULL;

ALTER TABLE bom_template_items
  ADD COLUMN part_id UUID REFERENCES parts(id) ON DELETE SET NULL;

CREATE INDEX idx_line_items_part_id ON line_items(part_id);
CREATE INDEX idx_bom_template_items_part_id ON bom_template_items(part_id);

-- 4. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW
  EXECUTE FUNCTION update_parts_updated_at();

-- 5. Function to detect circular references in assembly relationships
-- Returns TRUE if adding the relationship would create a cycle
CREATE OR REPLACE FUNCTION would_create_cycle(
  p_parent_id UUID,
  p_child_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_id UUID;
  v_visited_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Start from the would-be child and walk up the parent chain
  v_current_id := p_child_id;

  WHILE v_current_id IS NOT NULL LOOP
    -- If we find the parent in the child's ancestor chain, it's a cycle
    IF v_current_id = p_parent_id THEN
      RETURN TRUE;
    END IF;

    -- Prevent infinite loops in case of existing cycles
    IF v_current_id = ANY(v_visited_ids) THEN
      RETURN TRUE;
    END IF;

    v_visited_ids := array_append(v_visited_ids, v_current_id);

    -- Walk up to parent assemblies
    SELECT pr.parent_part_id INTO v_current_id
    FROM part_relationships pr
    WHERE pr.child_part_id = v_current_id
    LIMIT 1;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 6. View: Exploded BOM (flatten assembly to leaf parts with multiplied quantities)
-- Recursively expands an assembly into all its component parts
CREATE OR REPLACE VIEW parts_exploded_bom AS
WITH RECURSIVE bom_explosion AS (
  -- Base case: direct children
  SELECT
    pr.parent_part_id,
    pr.child_part_id AS part_id,
    p.part_number,
    p.description,
    p.classification_type,
    pr.quantity::DECIMAL(10,3) AS quantity,
    1 AS level,
    ARRAY[pr.parent_part_id] AS path
  FROM part_relationships pr
  JOIN parts p ON p.id = pr.child_part_id

  UNION ALL

  -- Recursive case: children of assemblies
  SELECT
    be.parent_part_id,
    pr.child_part_id AS part_id,
    p.part_number,
    p.description,
    p.classification_type,
    (be.quantity * pr.quantity)::DECIMAL(10,3) AS quantity,
    be.level + 1 AS level,
    be.path || pr.parent_part_id
  FROM bom_explosion be
  JOIN part_relationships pr ON pr.parent_part_id = be.part_id
  JOIN parts p ON p.id = pr.child_part_id
  WHERE NOT (pr.parent_part_id = ANY(be.path)) -- Prevent infinite loops
)
SELECT
  parent_part_id,
  part_id,
  part_number,
  description,
  classification_type,
  SUM(quantity)::DECIMAL(10,3) AS total_quantity,
  MAX(level) AS max_level
FROM bom_explosion
GROUP BY parent_part_id, part_id, part_number, description, classification_type;

-- 7. View: Parts with relationship counts (for catalog display)
CREATE OR REPLACE VIEW parts_with_stats AS
SELECT
  p.*,
  COUNT(DISTINCT pr_parent.id) AS child_count,
  COUNT(DISTINCT pr_child.id) AS used_in_count
FROM parts p
LEFT JOIN part_relationships pr_parent ON pr_parent.parent_part_id = p.id
LEFT JOIN part_relationships pr_child ON pr_child.child_part_id = p.id
GROUP BY p.id;

COMMENT ON TABLE parts IS 'Master parts catalog with optional classification and hierarchical relationships';
COMMENT ON TABLE part_relationships IS 'Assembly bill of materials - defines which parts make up assemblies';
COMMENT ON COLUMN parts.classification_type IS 'Part type: purchased (bought as-is), manufactured (made in-house), assembly (built from other parts), modified (based on another part)';
COMMENT ON COLUMN parts.base_part_id IS 'For modified parts: the original part this was modified from';
COMMENT ON FUNCTION would_create_cycle IS 'Checks if adding a parent-child relationship would create a circular dependency';
