-- Database Integrity Checks for Assembly Consolidation
-- Run these queries after migration to verify data integrity

-- ============================================================================
-- CHECK 1: Line items without any assembly information
-- Expected: 0 (all items should have either part_id or assembly_group)
-- ============================================================================
SELECT COUNT(*) as orphaned_line_items
FROM line_items
WHERE part_id IS NULL AND assembly_group IS NULL;

-- If non-zero, investigate these items:
-- SELECT id, order_id, part_number, description
-- FROM line_items
-- WHERE part_id IS NULL AND assembly_group IS NULL;


-- ============================================================================
-- CHECK 2: Orphaned part relationships (parent doesn't exist)
-- Expected: 0
-- ============================================================================
SELECT COUNT(*) as orphaned_parent_relationships
FROM part_relationships pr
LEFT JOIN parts p ON pr.parent_part_id = p.id
WHERE p.id IS NULL;

-- If non-zero, clean up:
-- DELETE FROM part_relationships
-- WHERE parent_part_id NOT IN (SELECT id FROM parts);


-- ============================================================================
-- CHECK 3: Orphaned part relationships (child doesn't exist)
-- Expected: 0
-- ============================================================================
SELECT COUNT(*) as orphaned_child_relationships
FROM part_relationships pr
LEFT JOIN parts p ON pr.child_part_id = p.id
WHERE p.id IS NULL;

-- If non-zero, clean up:
-- DELETE FROM part_relationships
-- WHERE child_part_id NOT IN (SELECT id FROM parts);


-- ============================================================================
-- CHECK 4: Parts marked as assemblies without any children
-- Expected: Low count (may indicate data quality issues)
-- ============================================================================
SELECT COUNT(*) as assemblies_without_children
FROM parts p
WHERE p.is_assembly = true
  AND NOT EXISTS (
    SELECT 1 FROM part_relationships pr
    WHERE pr.parent_part_id = p.id
  );

-- If non-zero, review these assemblies:
-- SELECT p.part_number, p.description
-- FROM parts p
-- WHERE p.is_assembly = true
--   AND NOT EXISTS (
--     SELECT 1 FROM part_relationships pr
--     WHERE pr.parent_part_id = p.id
--   );


-- ============================================================================
-- CHECK 5: Line items with assembly_group text but no part_id
-- These are legacy-only items that haven't been migrated yet
-- ============================================================================
SELECT COUNT(*) as legacy_only_assemblies
FROM line_items
WHERE assembly_group IS NOT NULL
  AND part_id IS NULL;

-- Review these for manual migration:
-- SELECT DISTINCT assembly_group
-- FROM line_items
-- WHERE assembly_group IS NOT NULL
--   AND part_id IS NULL
-- ORDER BY assembly_group;


-- ============================================================================
-- CHECK 6: Verify assembly part counts match expected structure
-- Shows each assembly with its component count
-- ============================================================================
SELECT
  p.part_number,
  p.description,
  p.is_assembly,
  COUNT(pr.id) as component_count
FROM parts p
LEFT JOIN part_relationships pr ON pr.parent_part_id = p.id
WHERE p.is_assembly = true
GROUP BY p.id, p.part_number, p.description, p.is_assembly
ORDER BY component_count DESC, p.part_number;


-- ============================================================================
-- CHECK 7: Migration status summary
-- Shows overall migration progress
-- ============================================================================
SELECT
  COUNT(*) FILTER (WHERE assembly_group IS NOT NULL) as total_assemblies,
  COUNT(*) FILTER (WHERE part_id IS NOT NULL) as structured_assemblies,
  COUNT(*) FILTER (WHERE assembly_group IS NOT NULL AND part_id IS NULL) as legacy_only,
  COUNT(*) FILTER (WHERE assembly_migrated_at IS NOT NULL) as migrated_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE part_id IS NOT NULL) /
    NULLIF(COUNT(*) FILTER (WHERE assembly_group IS NOT NULL), 0),
    2
  ) as migration_percentage
FROM line_items;


-- ============================================================================
-- CHECK 8: Duplicate part_number check in parts catalog
-- Expected: 0 (part_number should be unique)
-- ============================================================================
SELECT part_number, COUNT(*) as duplicate_count
FROM parts
GROUP BY part_number
HAVING COUNT(*) > 1;

-- If duplicates exist, review and merge:
-- SELECT id, part_number, description, is_assembly, created_at
-- FROM parts
-- WHERE part_number IN (
--   SELECT part_number FROM parts
--   GROUP BY part_number HAVING COUNT(*) > 1
-- )
-- ORDER BY part_number, created_at;


-- ============================================================================
-- CHECK 9: Circular reference detection
-- Checks for parts that are their own ancestor (A contains B contains A)
-- ============================================================================
WITH RECURSIVE assembly_tree AS (
  -- Base case: start with all relationships
  SELECT
    parent_part_id,
    child_part_id,
    ARRAY[parent_part_id, child_part_id] as path,
    1 as depth
  FROM part_relationships

  UNION ALL

  -- Recursive case: follow the tree
  SELECT
    at.parent_part_id,
    pr.child_part_id,
    at.path || pr.child_part_id,
    at.depth + 1
  FROM assembly_tree at
  JOIN part_relationships pr ON at.child_part_id = pr.parent_part_id
  WHERE at.depth < 10 -- Limit recursion depth
    AND NOT (pr.child_part_id = ANY(at.path)) -- Stop if we've seen this part before
)
SELECT DISTINCT
  p1.part_number as parent_part,
  p2.part_number as child_part,
  at.depth as relationship_depth
FROM assembly_tree at
JOIN parts p1 ON at.parent_part_id = p1.id
JOIN parts p2 ON at.child_part_id = p2.id
WHERE at.child_part_id = at.parent_part_id -- Circular reference found
ORDER BY p1.part_number;

-- Expected: 0 rows (no circular references)


-- ============================================================================
-- CHECK 10: Assembly relationships without quantity
-- Expected: 0 (all relationships should have quantity > 0)
-- ============================================================================
SELECT COUNT(*) as relationships_without_quantity
FROM part_relationships
WHERE quantity IS NULL OR quantity <= 0;

-- If non-zero, update with default quantity:
-- UPDATE part_relationships
-- SET quantity = 1
-- WHERE quantity IS NULL OR quantity <= 0;
