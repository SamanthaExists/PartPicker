// Database types matching Supabase schema

export interface Order {
  id: string;
  so_number: string;
  po_number: string | null;
  customer_name: string | null;
  tool_model: string | null;
  quantity: number | null;
  order_date: string | null;
  due_date: string | null;
  status: 'active' | 'complete' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tool {
  id: string;
  order_id: string;
  tool_number: string;
  serial_number: string | null;
  tool_model: string | null;
  status: 'pending' | 'in-progress' | 'complete';
  created_at: string;
}

export interface LineItem {
  id: string;
  order_id: string;
  part_number: string;
  description: string | null;
  location: string | null;
  qty_per_unit: number;
  total_qty_needed: number;
  qty_available: number | null;
  qty_on_order: number | null;
  tool_ids: string[] | null; // Array of tool IDs this part applies to (null = all tools)
  created_at: string;
}

export interface Pick {
  id: string;
  line_item_id: string;
  tool_id: string;
  qty_picked: number;
  picked_by: string | null;
  notes: string | null;
  picked_at: string;
}

export type IssueType = 'out_of_stock' | 'wrong_part' | 'damaged' | 'other';
export type IssueStatus = 'open' | 'resolved';

export interface Issue {
  id: string;
  line_item_id: string;
  order_id: string;
  issue_type: IssueType;
  description: string | null;
  reported_by: string | null;
  status: IssueStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface IssueWithDetails extends Issue {
  line_item?: LineItem;
  order?: Order;
}

// Extended types with relations

export interface OrderWithTools extends Order {
  tools: Tool[];
}

export interface OrderWithProgress extends Order {
  tools: Tool[];
  total_items: number;
  picked_items: number;
  progress_percent: number;
}

export interface LineItemWithPicks extends LineItem {
  picks: Pick[];
  total_picked: number;
  remaining: number;
}

export interface ToolWithPicks extends Tool {
  picks: Pick[];
}

// Consolidated parts view

export interface ConsolidatedPart {
  part_number: string;
  description: string | null;
  location: string | null;
  qty_available: number | null;
  qty_on_order: number | null;
  total_needed: number;
  total_picked: number;
  remaining: number;
  orders: {
    order_id: string;
    so_number: string;
    order_date: string | null;
    needed: number;
    picked: number;
    line_item_id: string;
  }[];
}

// Items to order (parts with insufficient stock to complete active orders)

export interface ItemToOrder {
  part_number: string;
  description: string | null;
  location: string | null;
  qty_available: number;
  qty_on_order: number | null;
  total_needed: number;
  total_picked: number;
  remaining: number;
  qty_to_order: number; // How many we need to order (remaining - qty_available - qty_on_order)
  orders: {
    order_id: string;
    so_number: string;
    needed: number;
    picked: number;
  }[];
}

// Import types

export interface ImportedOrder {
  so_number: string;
  po_number?: string;
  customer_name?: string;
  order_date?: string;
  due_date?: string;
  tools: ImportedTool[];
  line_items: ImportedLineItem[];
}

export interface ImportedTool {
  tool_number: string;
  serial_number?: string;
  tool_model?: string;
}

export interface ImportedLineItem {
  part_number: string;
  description?: string;
  location?: string;
  qty_per_unit: number;
  total_qty_needed: number;
  tool_ids?: string[]; // Tool IDs this part applies to (undefined = all tools)
}

// Activity feed

export interface RecentActivity {
  id: string;
  type: 'pick' | 'order_created' | 'order_completed';
  message: string;
  timestamp: string;
  user?: string;
  order_id?: string;
  so_number?: string;
}

// User settings

export interface UserSettings {
  user_name: string;
  theme: 'light' | 'dark' | 'system';
  isAuthenticated?: boolean;
}

// Parts Catalog - saved part numbers and descriptions

export interface PartsCatalogItem {
  id: string;
  part_number: string;
  description: string | null;
  default_location: string | null;
  created_at: string;
  updated_at: string;
}

// BOM Templates

export interface BOMTemplate {
  id: string;
  name: string;
  tool_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface BOMTemplateItem {
  id: string;
  template_id: string;
  part_number: string;
  description: string | null;
  location: string | null;
  qty_per_unit: number;
}

export interface BOMTemplateWithItems extends BOMTemplate {
  items: BOMTemplateItem[];
}

// Part conflict for import

export interface PartConflict {
  part_number: string;
  saved_description: string | null;
  import_description: string | null;
  saved_location: string | null;
  import_location: string | null;
  action: 'keep' | 'update' | null;
}
