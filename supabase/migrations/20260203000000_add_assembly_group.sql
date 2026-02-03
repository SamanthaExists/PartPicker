-- Add tool_ids and assembly_group columns to line_items for multi-BOM import
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS tool_ids UUID[];
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS assembly_group TEXT;

-- Add tool_model column to tools table
ALTER TABLE tools ADD COLUMN IF NOT EXISTS tool_model TEXT;
