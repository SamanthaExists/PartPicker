-- Add per-tool quantity overrides to line_items
-- Format: {"<tool_uuid>": 6} — only stores entries that differ from qty_per_unit
-- NULL = no overrides, all tools use qty_per_unit (backward compatible)
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS qty_overrides JSONB DEFAULT NULL;

-- Update recalculate_line_item_totals to account for per-tool overrides
-- When qty_overrides is present, total_qty_needed = sum of per-tool quantities
-- (overridden tools use their override, others use qty_per_unit)
CREATE OR REPLACE FUNCTION recalculate_line_item_totals(target_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  tool_count INT;
  rec RECORD;
  tool_rec RECORD;
  new_total INT;
  override_qty INT;
BEGIN
  SELECT COUNT(*) INTO tool_count FROM tools WHERE order_id = target_order_id;

  -- Line items WITHOUT overrides: same logic as before
  -- All tools (tool_ids IS NULL)
  UPDATE line_items
  SET total_qty_needed = qty_per_unit * tool_count
  WHERE order_id = target_order_id
    AND (tool_ids IS NULL OR array_length(tool_ids, 1) IS NULL)
    AND (qty_overrides IS NULL OR qty_overrides = '{}'::jsonb)
    AND total_qty_needed != qty_per_unit * tool_count;

  -- Specific tool_ids, no overrides
  UPDATE line_items
  SET total_qty_needed = qty_per_unit * array_length(tool_ids, 1)
  WHERE order_id = target_order_id
    AND tool_ids IS NOT NULL AND array_length(tool_ids, 1) IS NOT NULL
    AND (qty_overrides IS NULL OR qty_overrides = '{}'::jsonb)
    AND total_qty_needed != qty_per_unit * array_length(tool_ids, 1);

  -- Line items WITH overrides: sum per-tool quantities
  FOR rec IN
    SELECT li.id, li.qty_per_unit, li.tool_ids, li.qty_overrides
    FROM line_items li
    WHERE li.order_id = target_order_id
      AND li.qty_overrides IS NOT NULL
      AND li.qty_overrides != '{}'::jsonb
  LOOP
    new_total := 0;

    IF rec.tool_ids IS NULL OR array_length(rec.tool_ids, 1) IS NULL THEN
      -- Applies to all tools in the order
      FOR tool_rec IN SELECT id FROM tools WHERE order_id = target_order_id
      LOOP
        override_qty := (rec.qty_overrides ->> tool_rec.id::text)::int;
        IF override_qty IS NOT NULL THEN
          new_total := new_total + override_qty;
        ELSE
          new_total := new_total + rec.qty_per_unit;
        END IF;
      END LOOP;
    ELSE
      -- Applies to specific tools
      FOR i IN 1..array_length(rec.tool_ids, 1)
      LOOP
        override_qty := (rec.qty_overrides ->> rec.tool_ids[i]::text)::int;
        IF override_qty IS NOT NULL THEN
          new_total := new_total + override_qty;
        ELSE
          new_total := new_total + rec.qty_per_unit;
        END IF;
      END LOOP;
    END IF;

    UPDATE line_items
    SET total_qty_needed = new_total
    WHERE id = rec.id AND total_qty_needed != new_total;
  END LOOP;
END;
$$;

-- Recreate line_item_pick_totals view to include qty_overrides
-- Must DROP CASCADE because order_progress depends on it
DROP VIEW IF EXISTS line_item_pick_totals CASCADE;
CREATE VIEW line_item_pick_totals AS
SELECT
  li.id AS line_item_id,
  li.order_id,
  li.part_number,
  li.description,
  li.location,
  li.qty_available,
  li.qty_on_order,
  li.total_qty_needed,
  li.qty_per_unit,
  li.qty_overrides,
  li.assembly_group,
  COALESCE(SUM(p.qty_picked), 0)::int AS total_picked,
  (li.total_qty_needed - COALESCE(SUM(p.qty_picked), 0))::int AS remaining
FROM line_items li
LEFT JOIN picks p ON p.line_item_id = li.id
GROUP BY li.id;

COMMENT ON VIEW line_item_pick_totals IS 'Per-line-item pick aggregation for the inventory API';

-- Recreate order_progress view (dropped by CASCADE above)
CREATE OR REPLACE VIEW order_progress AS
SELECT
  li.order_id,
  COUNT(*)::int AS total_items,
  COUNT(*) FILTER (WHERE lipt.total_picked >= li.total_qty_needed)::int AS picked_items,
  CASE WHEN COUNT(*) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE lipt.total_picked >= li.total_qty_needed))::numeric / COUNT(*) * 100)
    ELSE 0
  END::int AS progress_percent
FROM line_items li
JOIN line_item_pick_totals lipt ON lipt.line_item_id = li.id
GROUP BY li.order_id;

COMMENT ON VIEW order_progress IS 'Per-order pick progress computed from line_item_pick_totals, used by Dashboard';
