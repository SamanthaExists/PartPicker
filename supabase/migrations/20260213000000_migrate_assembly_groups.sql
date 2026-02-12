-- Migration: Parse assembly_group text and populate structured parts/relationships
-- Converts legacy "CHILD < PARENT" format to structured parts catalog

-- Function to migrate assembly groups to structured parts and relationships
CREATE OR REPLACE FUNCTION migrate_assembly_groups_to_parts()
RETURNS TABLE(
  assemblies_created INTEGER,
  parts_created INTEGER,
  relationships_created INTEGER,
  line_items_updated INTEGER
) AS $$
DECLARE
  v_assemblies_created INTEGER := 0;
  v_parts_created INTEGER := 0;
  v_relationships_created INTEGER := 0;
  v_line_items_updated INTEGER := 0;
  v_line_item RECORD;
  v_assembly_chain TEXT[];
  v_part_name TEXT;
  v_parent_part_id UUID;
  v_child_part_id UUID;
  v_part_id UUID;
  v_i INTEGER;
BEGIN
  -- Loop through all line_items with assembly_group data
  FOR v_line_item IN
    SELECT id, part_number, description, assembly_group
    FROM line_items
    WHERE assembly_group IS NOT NULL
      AND assembly_group != ''
      AND part_id IS NULL  -- Only process items not yet linked to parts
  LOOP
    -- Parse assembly_group: split by " < " to get chain
    -- Example: "CHILD < PARENT" or "CHILD < PARENT1 < PARENT2"
    v_assembly_chain := string_to_array(v_line_item.assembly_group, ' < ');

    -- Skip if parsing failed or empty
    IF v_assembly_chain IS NULL OR array_length(v_assembly_chain, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Process each part in the chain from right to left (top-level parent first)
    FOR v_i IN REVERSE array_length(v_assembly_chain, 1) .. 1 LOOP
      v_part_name := trim(v_assembly_chain[v_i]);

      -- Skip empty names
      IF v_part_name IS NULL OR v_part_name = '' THEN
        CONTINUE;
      END IF;

      -- Check if part already exists in parts table
      SELECT id INTO v_part_id
      FROM parts
      WHERE part_number = v_part_name;

      -- If part doesn't exist, create it
      IF v_part_id IS NULL THEN
        -- Determine if this is an assembly (not the leaf/leftmost item)
        IF v_i > 1 THEN
          -- This is a parent assembly
          INSERT INTO parts (part_number, classification_type, description, notes)
          VALUES (
            v_part_name,
            'assembly',
            'Assembly from BOM import',
            'Auto-created from assembly_group: ' || v_line_item.assembly_group
          )
          RETURNING id INTO v_part_id;

          v_assemblies_created := v_assemblies_created + 1;
        ELSE
          -- This is the leaf component (leftmost item)
          INSERT INTO parts (part_number, description, notes)
          VALUES (
            v_part_name,
            v_line_item.description,
            'Auto-created from assembly_group: ' || v_line_item.assembly_group
          )
          RETURNING id INTO v_part_id;
        END IF;

        v_parts_created := v_parts_created + 1;
      END IF;

      -- If this is not the rightmost (top-level) item, create relationship with parent
      IF v_i < array_length(v_assembly_chain, 1) THEN
        -- Parent is the next item to the right
        v_parent_part_id := (
          SELECT id FROM parts WHERE part_number = trim(v_assembly_chain[v_i + 1])
        );

        IF v_parent_part_id IS NOT NULL THEN
          -- Create relationship if it doesn't exist
          INSERT INTO part_relationships (parent_part_id, child_part_id, quantity, notes)
          VALUES (
            v_parent_part_id,
            v_part_id,
            1,  -- Default quantity is 1 (not specified in assembly_group format)
            'Auto-created from assembly_group'
          )
          ON CONFLICT (parent_part_id, child_part_id) DO NOTHING;

          -- Count if we actually inserted (ON CONFLICT may skip)
          IF FOUND THEN
            v_relationships_created := v_relationships_created + 1;
          END IF;
        END IF;
      END IF;

      -- For the leftmost item (the actual line item part), link it to line_items
      IF v_i = 1 THEN
        UPDATE line_items
        SET part_id = v_part_id
        WHERE id = v_line_item.id;

        v_line_items_updated := v_line_items_updated + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Return summary counts
  RETURN QUERY SELECT
    v_assemblies_created,
    v_parts_created,
    v_relationships_created,
    v_line_items_updated;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM migrate_assembly_groups_to_parts();

  RAISE NOTICE 'Migration completed:';
  RAISE NOTICE '  Assemblies created: %', v_result.assemblies_created;
  RAISE NOTICE '  Parts created: %', v_result.parts_created;
  RAISE NOTICE '  Relationships created: %', v_result.relationships_created;
  RAISE NOTICE '  Line items updated: %', v_result.line_items_updated;
END $$;

-- Add helpful comment
COMMENT ON FUNCTION migrate_assembly_groups_to_parts IS
  'Parses assembly_group text (format: "CHILD < PARENT" or "CHILD < PARENT1 < PARENT2") and populates parts and part_relationships tables. Keeps original assembly_group text for audit trail.';
