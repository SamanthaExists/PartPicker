import { Injectable } from '@angular/core';
import { 
  Order, 
  Tool, 
  LineItem, 
  Pick, 
  Issue, 
  BOMTemplate, 
  BOMTemplateItem, 
  Part,
  PartRelationship,
  ActivityLogEntry,
  PartIssue
} from '../models';

@Injectable({
  providedIn: 'root'
})
export class DemoDataService {
  private orders: Order[] = [];
  private tools: Tool[] = [];
  private lineItems: LineItem[] = [];
  private picks: Pick[] = [];
  private issues: Issue[] = [];
  private bomTemplates: BOMTemplate[] = [];
  private bomTemplateItems: BOMTemplateItem[] = [];
  private parts: Part[] = [];
  private partRelationships: PartRelationship[] = [];
  private activityLog: ActivityLogEntry[] = [];
  private partIssues: PartIssue[] = [];

  constructor() {
    this.generateDemoData();
  }

  private generateDemoData(): void {
    // Generate parts catalog first (needed for line items)
    this.generateParts();
    
    // Generate orders with tools and line items
    this.generateOrders();
    
    // Generate picks
    this.generatePicks();
    
    // Generate issues
    this.generateIssues();
    
    // Generate BOM templates
    this.generateBOMTemplates();
    
    // Generate activity log
    this.generateActivityLog();
    
    // Generate part issues
    this.generatePartIssues();
  }

  private generateParts(): void {
    const partData = [
      { part_number: 'BRG-4520', description: 'Bearing Assembly - 45mm', classification: 'purchased' as const, location: 'A-12-3' },
      { part_number: 'MTR-1100', description: 'Drive Motor 1100W', classification: 'purchased' as const, location: 'B-05-1' },
      { part_number: 'HSG-2200', description: 'Housing Unit - Aluminum', classification: 'manufactured' as const, location: 'C-22-4' },
      { part_number: 'SFT-0850', description: 'Drive Shaft - Hardened Steel', classification: 'manufactured' as const, location: 'A-08-2' },
      { part_number: 'GRB-3300', description: 'Gearbox Assembly', classification: 'purchased' as const, location: 'B-15-3', is_assembly: true },
      { part_number: 'PLT-1001', description: 'Control Plate - Stainless', classification: 'manufactured' as const, location: 'C-03-1' },
      { part_number: 'PCB-5500', description: 'Main Control Board', classification: 'purchased' as const, location: 'D-01-5' },
      { part_number: 'CBL-2220', description: 'Power Cable Assembly 12AWG', classification: 'purchased' as const, location: 'A-18-1' },
      { part_number: 'FLT-0770', description: 'Air Filter Element', classification: 'purchased' as const, location: 'B-22-2' },
      { part_number: 'VLV-4100', description: 'Pressure Relief Valve', classification: 'purchased' as const, location: 'C-11-4' },
      { part_number: 'GSK-0055', description: 'Gasket Kit - NBR', classification: 'purchased' as const, location: 'A-25-5' },
      { part_number: 'BLT-M12', description: 'Bolt M12x40 - Grade 8', classification: 'purchased' as const, location: 'D-15-2' },
      { part_number: 'NUT-M12', description: 'Locknut M12 - Nylon Insert', classification: 'purchased' as const, location: 'D-15-3' },
      { part_number: 'WSH-M12', description: 'Washer M12 - Hardened', classification: 'purchased' as const, location: 'D-15-4' },
      { part_number: 'SNS-TEMP', description: 'Temperature Sensor PT100', classification: 'purchased' as const, location: 'D-08-1' },
      { part_number: 'SNS-PRES', description: 'Pressure Sensor 0-300PSI', classification: 'purchased' as const, location: 'D-08-2' },
      { part_number: 'PMP-7700', description: 'Hydraulic Pump Assembly', classification: 'purchased' as const, location: 'B-12-1', is_assembly: true },
      { part_number: 'TRN-5500', description: 'Transformer 480V-120V', classification: 'purchased' as const, location: 'C-19-3' },
      { part_number: 'FAN-2400', description: 'Cooling Fan 24VDC', classification: 'purchased' as const, location: 'B-08-4' },
      { part_number: 'CVR-TOP', description: 'Top Cover - Powder Coated', classification: 'manufactured' as const, location: 'C-05-2' },
      { part_number: 'CVR-BTM', description: 'Bottom Cover - Powder Coated', classification: 'manufactured' as const, location: 'C-05-3' },
      { part_number: 'MNT-BRK', description: 'Mounting Bracket - Steel', classification: 'manufactured' as const, location: 'A-14-2' },
      { part_number: 'SLD-PLT', description: 'Slide Plate Assembly', classification: 'manufactured' as const, location: 'B-19-1', is_assembly: true },
    ];

    this.parts = partData.map((p, i) => ({
      id: `part-${i + 1}`,
      part_number: p.part_number,
      description: p.description,
      classification_type: p.classification,
      is_assembly: p.is_assembly || false,
      is_modified: false,
      default_location: p.location,
      base_part_id: null,
      notes: null,
      created_at: new Date(2024, 0, 15 + i).toISOString(),
      updated_at: new Date(2024, 0, 15 + i).toISOString(),
    }));

    // Create some part relationships for assemblies
    this.partRelationships = [
      { id: 'rel-1', parent_part_id: 'part-5', child_part_id: 'part-1', quantity: 2, reference_designator: 'BRG1, BRG2', notes: null, sort_order: 1, created_at: new Date().toISOString() },
      { id: 'rel-2', parent_part_id: 'part-5', child_part_id: 'part-4', quantity: 1, reference_designator: 'SFT1', notes: null, sort_order: 2, created_at: new Date().toISOString() },
      { id: 'rel-3', parent_part_id: 'part-17', child_part_id: 'part-2', quantity: 1, reference_designator: 'MTR1', notes: null, sort_order: 1, created_at: new Date().toISOString() },
      { id: 'rel-4', parent_part_id: 'part-17', child_part_id: 'part-10', quantity: 1, reference_designator: 'VLV1', notes: null, sort_order: 2, created_at: new Date().toISOString() },
    ];
  }

  private generateOrders(): void {
    const now = new Date();
    const orderData = [
      {
        so_number: '24-1847',
        po_number: 'PO-2024-0892',
        customer_name: 'Acme Manufacturing',
        tool_model: 'AT-500',
        quantity: 2,
        order_date: new Date(2024, 10, 15).toISOString().split('T')[0],
        due_date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago (overdue)
        status: 'active' as const,
      },
      {
        so_number: '24-1923',
        po_number: 'PO-2024-1045',
        customer_name: 'Precision Tools Inc',
        tool_model: 'AT-750',
        quantity: 3,
        order_date: new Date(2024, 10, 28).toISOString().split('T')[0],
        due_date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
        status: 'active' as const,
      },
      {
        so_number: '24-1856',
        po_number: 'PO-2024-0923',
        customer_name: 'Gulf Coast Drilling',
        tool_model: 'AT-1000',
        quantity: 4,
        order_date: new Date(2024, 10, 20).toISOString().split('T')[0],
        due_date: new Date(2024, 11, 15).toISOString().split('T')[0],
        status: 'complete' as const,
      },
      {
        so_number: '25-0012',
        po_number: 'PO-2025-0001',
        customer_name: 'Industrial Solutions LLC',
        tool_model: 'AT-500',
        quantity: 1,
        order_date: new Date(2025, 0, 5).toISOString().split('T')[0],
        due_date: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tomorrow (due soon)
        status: 'active' as const,
      },
      {
        so_number: '25-0045',
        po_number: null,
        customer_name: 'Tech Innovations Corp',
        tool_model: 'AT-750',
        quantity: 2,
        order_date: new Date(2025, 0, 15).toISOString().split('T')[0],
        due_date: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'active' as const,
      },
      {
        so_number: '24-1799',
        po_number: 'PO-2024-0801',
        customer_name: 'Mountain Equipment Co',
        tool_model: 'AT-500',
        quantity: 3,
        order_date: new Date(2024, 9, 10).toISOString().split('T')[0],
        due_date: new Date(2024, 10, 5).toISOString().split('T')[0],
        status: 'cancelled' as const,
      },
    ];

    this.orders = orderData.map((o, i) => ({
      id: `order-${i + 1}`,
      so_number: o.so_number,
      po_number: o.po_number,
      customer_name: o.customer_name,
      tool_model: o.tool_model,
      quantity: o.quantity,
      order_date: o.order_date,
      due_date: o.due_date,
      estimated_ship_date: null,
      status: o.status,
      notes: null,
      created_at: new Date(2024, 10, 15 + i).toISOString(),
      updated_at: new Date(2024, 10, 15 + i).toISOString(),
    }));

    // Generate tools for each order
    this.orders.forEach((order, orderIdx) => {
      if (order.status === 'cancelled') return; // No tools for cancelled orders
      
      const toolCount = order.quantity || 1;
      for (let i = 0; i < toolCount; i++) {
        const toolNumber = `${i + 1}`;
        const serialNumber = `${order.tool_model}-${order.so_number.replace('-', '')}-${String(i + 1).padStart(3, '0')}`;
        
        this.tools.push({
          id: `tool-${this.tools.length + 1}`,
          order_id: order.id,
          tool_number: toolNumber,
          serial_number: serialNumber,
          tool_model: order.tool_model,
          status: order.status === 'complete' ? 'complete' : (orderIdx === 0 && i === 0 ? 'in-progress' : 'pending'),
          created_at: order.created_at,
        });
      }
    });

    // Generate line items for each order
    this.orders.forEach((order, orderIdx) => {
      if (order.status === 'cancelled') return;
      
      const orderTools = this.tools.filter(t => t.order_id === order.id);
      const isComplete = order.status === 'complete';
      const isOverdue = orderIdx === 0; // First order is overdue with partial progress
      const isDueSoon = orderIdx === 3; // Fourth order is due soon, one pick away from complete
      
      // Standard parts for all orders
      const standardParts = [
        { part: this.parts[0], qty: 2 }, // BRG-4520
        { part: this.parts[1], qty: 1 }, // MTR-1100
        { part: this.parts[2], qty: 1 }, // HSG-2200
        { part: this.parts[3], qty: 1 }, // SFT-0850
        { part: this.parts[6], qty: 1 }, // PCB-5500
        { part: this.parts[7], qty: 2 }, // CBL-2220
      ];

      // Add some variety
      if (orderIdx % 2 === 0) {
        standardParts.push({ part: this.parts[4], qty: 1 }); // GRB-3300
        standardParts.push({ part: this.parts[8], qty: 2 }); // FLT-0770
      }
      if (orderIdx % 3 === 0) {
        standardParts.push({ part: this.parts[9], qty: 1 }); // VLV-4100
        standardParts.push({ part: this.parts[10], qty: 1 }); // GSK-0055
      }

      standardParts.forEach(({ part, qty }) => {
        const lineItemId = `lineitem-${this.lineItems.length + 1}`;
        const totalQty = qty * orderTools.length;
        
        this.lineItems.push({
          id: lineItemId,
          order_id: order.id,
          part_number: part.part_number,
          description: part.description,
          location: part.default_location,
          qty_per_unit: qty,
          total_qty_needed: totalQty,
          qty_available: isComplete ? totalQty : Math.max(0, totalQty - Math.floor(Math.random() * 3)),
          qty_on_order: null,
          tool_ids: orderTools.map(t => t.id),
          assembly_group: null,
          part_id: part.id,
          created_at: order.created_at,
        });
      });
    });
  }

  private generatePicks(): void {
    const pickers = ['Mike T.', 'Sarah K.', 'Dave R.', 'Lisa M.', 'Tom B.'];
    
    this.lineItems.forEach((lineItem) => {
      const order = this.orders.find(o => o.id === lineItem.order_id);
      if (!order) return;
      
      const orderTools = this.tools.filter(t => t.order_id === order.id);
      const isComplete = order.status === 'complete';
      const isOverdue = order.so_number === '24-1847'; // Partial progress
      const isDueSoon = order.so_number === '25-0012'; // One pick away
      
      orderTools.forEach((tool, toolIdx) => {
        let qtyToPick = lineItem.qty_per_unit;
        
        if (isComplete) {
          // Complete orders: all picked
          this.picks.push({
            id: `pick-${this.picks.length + 1}`,
            line_item_id: lineItem.id,
            tool_id: tool.id,
            qty_picked: qtyToPick,
            picked_by: pickers[Math.floor(Math.random() * pickers.length)],
            notes: null,
            picked_at: new Date(order.created_at).toISOString(),
            undone_at: null,
            undone_by: null,
          });
        } else if (isOverdue) {
          // Overdue order: about 60% picked
          if (toolIdx === 0 && Math.random() > 0.4) {
            this.picks.push({
              id: `pick-${this.picks.length + 1}`,
              line_item_id: lineItem.id,
              tool_id: tool.id,
              qty_picked: qtyToPick,
              picked_by: pickers[Math.floor(Math.random() * pickers.length)],
              notes: null,
              picked_at: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000).toISOString(),
              undone_at: null,
              undone_by: null,
            });
          }
        } else if (isDueSoon && toolIdx === 0) {
          // Due soon order: all but ONE pick complete (for confetti demo)
          const skipOne = Math.random() > 0.9; // Skip one random pick
          if (!skipOne) {
            this.picks.push({
              id: `pick-${this.picks.length + 1}`,
              line_item_id: lineItem.id,
              tool_id: tool.id,
              qty_picked: qtyToPick,
              picked_by: pickers[Math.floor(Math.random() * pickers.length)],
              notes: null,
              picked_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
              undone_at: null,
              undone_by: null,
            });
          }
        } else {
          // Other active orders: random progress
          if (Math.random() > 0.5) {
            this.picks.push({
              id: `pick-${this.picks.length + 1}`,
              line_item_id: lineItem.id,
              tool_id: tool.id,
              qty_picked: qtyToPick,
              picked_by: pickers[Math.floor(Math.random() * pickers.length)],
              notes: null,
              picked_at: new Date(Date.now() - Math.random() * 72 * 60 * 60 * 1000).toISOString(),
              undone_at: null,
              undone_by: null,
            });
          }
        }
      });
    });
  }

  private generateIssues(): void {
    // Add a few issues to showcase the feature
    const overdueOrder = this.orders.find(o => o.so_number === '24-1847');
    if (overdueOrder) {
      const overdueLineItems = this.lineItems.filter(li => li.order_id === overdueOrder.id);
      
      if (overdueLineItems.length > 0) {
        this.issues.push({
          id: 'issue-1',
          line_item_id: overdueLineItems[0].id,
          order_id: overdueOrder.id,
          issue_type: 'out_of_stock',
          description: 'Bearing assembly not in stock, ordered from supplier',
          reported_by: 'Mike T.',
          status: 'open',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          resolved_at: null,
          resolved_by: null,
          resolution_notes: null,
        });
      }
      
      if (overdueLineItems.length > 1) {
        this.issues.push({
          id: 'issue-2',
          line_item_id: overdueLineItems[1].id,
          order_id: overdueOrder.id,
          issue_type: 'wrong_part',
          description: 'Wrong motor model received, returning to supplier',
          reported_by: 'Sarah K.',
          status: 'resolved',
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          resolved_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          resolved_by: 'Dave R.',
          resolution_notes: 'Correct motor received and installed',
        });
      }
    }
  }

  private generateBOMTemplates(): void {
    this.bomTemplates = [
      {
        id: 'template-1',
        name: 'AT-500 Standard',
        tool_model: 'AT-500',
        template_type: 'bom',
        created_at: new Date(2024, 0, 10).toISOString(),
        updated_at: new Date(2024, 0, 10).toISOString(),
      },
      {
        id: 'template-2',
        name: 'AT-750 Standard',
        tool_model: 'AT-750',
        template_type: 'bom',
        created_at: new Date(2024, 0, 12).toISOString(),
        updated_at: new Date(2024, 0, 12).toISOString(),
      },
      {
        id: 'template-3',
        name: 'AT-1000 Standard',
        tool_model: 'AT-1000',
        template_type: 'bom',
        created_at: new Date(2024, 0, 15).toISOString(),
        updated_at: new Date(2024, 0, 15).toISOString(),
      },
    ];

    // Template items for AT-500
    [0, 1, 2, 3, 6, 7].forEach((partIdx) => {
      const part = this.parts[partIdx];
      this.bomTemplateItems.push({
        id: `template-item-${this.bomTemplateItems.length + 1}`,
        template_id: 'template-1',
        part_number: part.part_number,
        description: part.description,
        location: part.default_location,
        qty_per_unit: partIdx === 0 || partIdx === 7 ? 2 : 1,
        assembly_group: null,
      });
    });

    // Template items for AT-750
    [0, 1, 2, 3, 4, 6, 7, 8].forEach((partIdx) => {
      const part = this.parts[partIdx];
      this.bomTemplateItems.push({
        id: `template-item-${this.bomTemplateItems.length + 1}`,
        template_id: 'template-2',
        part_number: part.part_number,
        description: part.description,
        location: part.default_location,
        qty_per_unit: partIdx === 0 || partIdx === 7 || partIdx === 8 ? 2 : 1,
        assembly_group: null,
      });
    });
  }

  private generateActivityLog(): void {
    const now = Date.now();
    
    this.activityLog = [
      {
        id: 'activity-1',
        type: 'order_imported',
        order_id: this.orders[4]?.id || 'order-5',
        so_number: '25-0045',
        part_number: null,
        description: null,
        performed_by: 'System',
        details: { tool_count: 2, line_item_count: 8 },
        created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'activity-2',
        type: 'part_added',
        order_id: this.orders[1]?.id || 'order-2',
        so_number: '24-1923',
        part_number: 'FAN-2400',
        description: 'Added cooling fan to order',
        performed_by: 'Sarah K.',
        details: null,
        created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'activity-3',
        type: 'part_removed',
        order_id: this.orders[0]?.id || 'order-1',
        so_number: '24-1847',
        part_number: 'TRN-5500',
        description: 'Removed transformer - not needed for this config',
        performed_by: 'Mike T.',
        details: null,
        created_at: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }

  private generatePartIssues(): void {
    this.partIssues = [
      {
        id: 'part-issue-1',
        part_number: 'BRG-4520',
        issue_type: 'inventory_discrepancy',
        description: 'Physical count shows 15 units but system shows 22',
        reported_by: 'Lisa M.',
        status: 'open',
        created_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
        resolved_at: null,
        resolved_by: null,
        resolution_notes: null,
      },
      {
        id: 'part-issue-2',
        part_number: 'HSG-2200',
        issue_type: 'wrong_location',
        description: 'Found in C-22-5 instead of C-22-4',
        reported_by: 'Tom B.',
        status: 'resolved',
        created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        resolved_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        resolved_by: 'Dave R.',
        resolution_notes: 'Moved to correct location and updated labels',
      },
    ];
  }

  // Public getters
  getOrders(): Order[] {
    return [...this.orders];
  }

  getTools(orderId?: string): Tool[] {
    if (orderId) {
      return this.tools.filter(t => t.order_id === orderId);
    }
    return [...this.tools];
  }

  getLineItems(orderId?: string): LineItem[] {
    if (orderId) {
      return this.lineItems.filter(li => li.order_id === orderId);
    }
    return [...this.lineItems];
  }

  getPicks(lineItemId?: string, toolId?: string): Pick[] {
    let filtered = [...this.picks];
    if (lineItemId) {
      filtered = filtered.filter(p => p.line_item_id === lineItemId);
    }
    if (toolId) {
      filtered = filtered.filter(p => p.tool_id === toolId);
    }
    return filtered;
  }

  getIssues(orderId?: string): Issue[] {
    if (orderId) {
      return this.issues.filter(i => i.order_id === orderId);
    }
    return [...this.issues];
  }

  getBOMTemplates(): BOMTemplate[] {
    return [...this.bomTemplates];
  }

  getBOMTemplateItems(templateId: string): BOMTemplateItem[] {
    return this.bomTemplateItems.filter(i => i.template_id === templateId);
  }

  getParts(): Part[] {
    return [...this.parts];
  }

  getPartRelationships(partId?: string): PartRelationship[] {
    if (partId) {
      return this.partRelationships.filter(
        r => r.parent_part_id === partId || r.child_part_id === partId
      );
    }
    return [...this.partRelationships];
  }

  getActivityLog(orderId?: string): ActivityLogEntry[] {
    if (orderId) {
      return this.activityLog.filter(a => a.order_id === orderId);
    }
    return [...this.activityLog];
  }

  getPartIssues(): PartIssue[] {
    return [...this.partIssues];
  }

  // Mutation methods for demo mode (stored in memory only)
  addPick(pick: Omit<Pick, 'id'>): Pick {
    const newPick: Pick = {
      ...pick,
      id: `pick-${this.picks.length + 1}`,
    };
    this.picks.push(newPick);
    return newPick;
  }

  updateOrder(id: string, updates: Partial<Order>): Order | null {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return null;
    
    this.orders[index] = { ...this.orders[index], ...updates, updated_at: new Date().toISOString() };
    return this.orders[index];
  }

  addIssue(issue: Omit<Issue, 'id'>): Issue {
    const newIssue: Issue = {
      ...issue,
      id: `issue-${this.issues.length + 1}`,
    };
    this.issues.push(newIssue);
    return newIssue;
  }

  updateIssue(id: string, updates: Partial<Issue>): Issue | null {
    const index = this.issues.findIndex(i => i.id === id);
    if (index === -1) return null;
    
    this.issues[index] = { ...this.issues[index], ...updates };
    return this.issues[index];
  }
}
