-- Auto-detect and create assemblies from existing order data
-- This migration analyzes line_items with assembly_group values and creates:
-- 1. Assembly parent parts
-- 2. Part relationships for components

-- Function to auto-detect and create assemblies from existing orders
CREATE OR REPLACE FUNCTION auto_detect_assemblies_from_orders()
RETURNS TABLE (
  assembly_name TEXT,
  components_count INTEGER,
  created_relationships INTEGER
) AS $$
DECLARE
  v_assembly_group TEXT;
  v_assembly_part_id UUID;
  v_component_record RECORD;
  v_relationships_created INTEGER := 0;
  v_components_count INTEGER := 0;
BEGIN
  -- Loop through each unique assembly_group in line_items
  FOR v_assembly_group IN
    SELECT DISTINCT li.assembly_group
    FROM line_items li
    WHERE li.assembly_group IS NOT NULL
    ORDER BY li.assembly_group
  LOOP
    -- Create or find the assembly parent part
    INSERT INTO parts (part_number, description, classification_type, notes)
    VALUES (
      v_assembly_group,
      'Assembly: ' || v_assembly_group,
      'assembly',
      'Auto-detected from order data'
    )
    ON CONFLICT (part_number)
    DO UPDATE SET
      classification_type = COALESCE(parts.classification_type, 'assembly'),
      notes = CASE
        WHEN parts.notes IS NULL OR parts.notes = ''
        THEN 'Auto-detected from order data'
        ELSE parts.notes || ' (auto-detected)'
      END
    RETURNING id INTO v_assembly_part_id;

    -- If no ID returned (already exists), fetch it
    IF v_assembly_part_id IS NULL THEN
      SELECT id INTO v_assembly_part_id
      FROM parts
      WHERE part_number = v_assembly_group;
    END IF;

    -- Count components in this assembly group
    v_components_count := 0;

    -- Create relationships for each component part in this assembly group
    FOR v_component_record IN
      SELECT DISTINCT
        li.part_number,
        li.description,
        li.location,
        li.qty_per_unit
      FROM line_items li
      WHERE li.assembly_group = v_assembly_group
        AND li.part_number != v_assembly_group  -- Don't add assembly to itself
      ORDER BY li.part_number
    LOOP
      v_components_count := v_components_count + 1;

      -- Create or find the component part
      INSERT INTO parts (part_number, description, default_location)
      VALUES (
        v_component_record.part_number,
        v_component_record.description,
        v_component_record.location
      )
      ON CONFLICT (part_number)
      DO UPDATE SET
        description = COALESCE(parts.description, EXCLUDED.description),
        default_location = COALESCE(parts.default_location, EXCLUDED.default_location);

      -- Create the relationship (if it doesn't already exist)
      INSERT INTO part_relationships (
        parent_part_id,
        child_part_id,
        quantity,
        notes
      )
      SELECT
        v_assembly_part_id,
        p.id,
        v_component_record.qty_per_unit,
        'Auto-detected from order data'
      FROM parts p
      WHERE p.part_number = v_component_record.part_number
      ON CONFLICT (parent_part_id, child_part_id) DO NOTHING;

      -- Check if relationship was created (not a duplicate)
      IF FOUND THEN
        v_relationships_created := v_relationships_created + 1;
      END IF;
    END LOOP;

    -- Return results for this assembly
    assembly_name := v_assembly_group;
    components_count := v_components_count;
    created_relationships := v_relationships_created;
    RETURN NEXT;

    v_relationships_created := 0;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_detect_assemblies_from_orders IS
  'Analyzes line_items with assembly_group values and automatically creates assembly parts and relationships. Returns summary of assemblies created.';

-- Run the function once to detect existing assemblies
-- Commented out so it doesn't run automatically - user can choose when to run it
-- SELECT * FROM auto_detect_assemblies_from_orders();
