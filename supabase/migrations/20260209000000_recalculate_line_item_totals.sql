-- Function to recalculate total_qty_needed on line items after tool count changes
-- Called from the app when tools are added or removed from an order
CREATE OR REPLACE FUNCTION recalculate_line_item_totals(target_order_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  tool_count INT;
BEGIN
  SELECT COUNT(*) INTO tool_count FROM tools WHERE order_id = target_order_id;

  -- Fix line items applying to all tools (tool_ids IS NULL)
  UPDATE line_items
  SET total_qty_needed = qty_per_unit * tool_count
  WHERE order_id = target_order_id
    AND (tool_ids IS NULL OR array_length(tool_ids, 1) IS NULL)
    AND total_qty_needed != qty_per_unit * tool_count;

  -- Fix line items with specific tool_ids
  UPDATE line_items
  SET total_qty_needed = qty_per_unit * array_length(tool_ids, 1)
  WHERE order_id = target_order_id
    AND tool_ids IS NOT NULL AND array_length(tool_ids, 1) IS NOT NULL
    AND total_qty_needed != qty_per_unit * array_length(tool_ids, 1);
END;
$$;
