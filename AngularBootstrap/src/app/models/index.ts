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
  estimated_ship_date: string | null;
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

/**
 * LineItem - Parts to pick for an order
 *
 * Assembly System Notes:
 * - part_id: Foreign key to structured parts catalog (PREFERRED). Links to parts table with
 *            full assembly relationships via part_relationships table.
 * - assembly_group: Legacy text format (e.g., "CHILD < PARENT1 < PARENT2"). Kept for audit
 *                   trail and backward compatibility. New imports populate both fields.
 * - Use AssemblyHelperService to read assembly data (handles both systems gracefully)
 */
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
  tool_ids: string[] | null;
  assembly_group: string | null; // Legacy text field (e.g., "CHILD < PARENT1 < PARENT2")
  part_id: string | null; // Links to structured parts catalog (preferred over assembly_group)
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
  undone_at: string | null;
  undone_by: string | null;
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
  resolution_notes: string | null;
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
    tool_model: string | null;
    tool_id: string;
    tool_number: string;
    needed: number;
    picked: number;
    line_item_id: string;
  }[];
}

// Items to order (parts with qty_available = 0 that still need picking)
export interface ItemToOrder {
  part_number: string;
  description: string | null;
  location: string | null;
  qty_available: number;
  qty_on_order: number | null;
  total_needed: number;
  total_picked: number;
  remaining: number;
  qty_to_order: number; // remaining - qty_available - qty_on_order
  orders: {
    order_id: string;
    so_number: string;
    tool_model: string | null;
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
  estimated_ship_date?: string;
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
  tool_ids?: string[];
  assembly_group?: string; // Legacy text format
  part_id?: string; // Links to structured parts catalog
  classification_type?: ClassificationType | null;
}

// Pick Undo audit trail
export interface PickUndo {
  id: string;
  original_pick_id: string;
  line_item_id: string;
  tool_id: string;
  qty_picked: number;
  picked_by: string | null;
  notes: string | null;
  picked_at: string;
  part_number: string;
  tool_number: string;
  so_number: string;
  order_id: string;
  undone_by: string;
  undone_at: string;
}

// Activity feed
export interface RecentActivity {
  id: string;
  type: 'pick' | 'pick_undo' | 'order_created' | 'order_completed' | 'part_added' | 'part_removed' | 'order_imported';
  message: string;
  timestamp: string;
  user?: string;
  order_id?: string;
  so_number?: string;
}

// Activity Log (database table)
export type ActivityLogType = 'part_added' | 'part_removed' | 'order_imported';

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  order_id: string;
  so_number: string;
  part_number: string | null;
  description: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// User settings
export interface UserSettings {
  user_name: string;
  theme: 'light' | 'dark' | 'system';
  isAuthenticated?: boolean;
  tagPrintingEnabled?: boolean;
}

// Parts Catalog
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
  template_type?: 'bom' | 'assembly';
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
  assembly_group: string | null;
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

// Part-level issues (different from line-item-level Issue)
export type PartIssueType = 'inventory_discrepancy' | 'wrong_location' | 'damaged' | 'other';
export type PartIssueStatus = 'open' | 'resolved';

export interface PartIssue {
  id: string;
  part_number: string;
  issue_type: PartIssueType;
  description: string | null;
  reported_by: string | null;
  status: PartIssueStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

export function getPartIssueTypeLabel(type: PartIssueType): string {
  const labels: Record<PartIssueType, string> = {
    inventory_discrepancy: 'Inventory Discrepancy',
    wrong_location: 'Wrong Location',
    damaged: 'Damaged',
    other: 'Other',
  };
  return labels[type] || type;
}

export function getPartIssueTypeColor(type: PartIssueType): string {
  const colors: Record<PartIssueType, string> = {
    inventory_discrepancy: 'bg-warning text-dark',
    wrong_location: 'bg-info text-dark',
    damaged: 'bg-danger',
    other: 'bg-secondary',
  };
  return colors[type] || 'bg-secondary';
}

// Line item input for creating/updating
export interface LineItemInput {
  part_number: string;
  description?: string;
  location?: string;
  qty_per_unit: number;
  total_qty_needed: number;
  qty_available?: number;
  tool_ids?: string[];
  assembly_group?: string;
}

// Parts Master Catalog - Enhanced part management with classification and relationships
export type ClassificationType = 'purchased' | 'manufactured';

export interface Part {
  id: string;
  part_number: string;
  description: string | null;
  classification_type: ClassificationType | null;
  is_assembly: boolean;
  is_modified: boolean;
  default_location: string | null;
  base_part_id: string | null; // For modified parts: reference to original part
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartRelationship {
  id: string;
  parent_part_id: string;
  child_part_id: string;
  quantity: number;
  reference_designator: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface PartWithStats extends Part {
  child_count: number; // How many parts this assembly contains
  used_in_count: number; // How many assemblies use this part
}

export interface PartWithRelationships extends Part {
  children: (PartRelationship & { part: Part })[]; // Parts this assembly contains
  used_in: (PartRelationship & { part: Part })[]; // Assemblies that use this part
  base_part?: Part; // For modified parts: the original part
  modifications?: Part[]; // Parts that are modifications of this one
}

export interface ExplodedPart {
  parent_part_id: string;
  part_id: string;
  part_number: string;
  description: string | null;
  classification_type: ClassificationType | null;
  total_quantity: number;
  max_level: number;
}

export interface ModificationChainItem {
  part: Part;
  level: number; // 0 = original, 1+ = modification depth
}

export interface CircularReferenceWarning {
  would_cycle: boolean;
  message: string;
}

// Unified Catalog Types - Bridge between Templates and Parts
export interface UnifiedListItem {
  id: string;
  type: 'template' | 'part';
  displayName: string;  // template.name OR part.part_number
  subtitle: string;     // item count OR description
  badges: {
    text: string;
    color: string;
    icon?: string;
  }[];
  icon: string;         // visual indicator (bi- class)
  stats: {
    childCount?: number;     // For assembly parts
    usedInCount?: number;    // For parts used in assemblies
    itemCount?: number;      // For templates
  };
}

export interface UnifiedItem {
  type: 'template' | 'part';
  data: BOMTemplateWithItems | PartWithRelationships;
}
