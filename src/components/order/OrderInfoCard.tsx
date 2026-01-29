import { useState } from 'react';
import { Pencil, X, Save, ChevronDown, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Order, Tool } from '@/types';
import { formatDate, getDueDateStatus, getDueDateColors, cn } from '@/lib/utils';

interface OrderInfoCardProps {
  order: Order;
  tools: Tool[];
  onSave: (updates: Partial<Order>) => Promise<void>;
}

export function OrderInfoCard({ order, tools, onSave }: OrderInfoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    so_number: '',
    po_number: '',
    customer_name: '',
    tool_model: '',
    order_date: '',
    due_date: '',
    notes: '',
  });

  const startEditing = () => {
    setEditForm({
      so_number: order.so_number || '',
      po_number: order.po_number || '',
      customer_name: order.customer_name || '',
      tool_model: order.tool_model || '',
      order_date: order.order_date || '',
      due_date: order.due_date || '',
      notes: order.notes || '',
    });
    setIsEditing(true);
  };

  const saveChanges = async () => {
    await onSave({
      so_number: editForm.so_number || order.so_number,
      po_number: editForm.po_number || null,
      customer_name: editForm.customer_name || null,
      tool_model: editForm.tool_model || null,
      order_date: editForm.order_date || null,
      due_date: editForm.due_date || null,
      notes: editForm.notes || null,
    });
    setIsEditing(false);
  };

  const dueDateInfo = getDueDateStatus(order.due_date);
  const dueDateColors = getDueDateColors(dueDateInfo.status);
  const isComplete = order.status === 'complete';

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="flex flex-row items-center justify-between py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <CardTitle className="text-base">Order Information</CardTitle>
          {/* Summary when collapsed */}
          {!isExpanded && !isEditing && (
            <span className="text-sm text-muted-foreground ml-2">
              {[
                order.customer_name,
                order.po_number && `PO: ${order.po_number}`,
                order.tool_model,
                order.due_date && `Due: ${formatDate(order.due_date)}`
              ].filter(Boolean).join(' • ') || 'No details'}
            </span>
          )}
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {!isEditing ? (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setIsExpanded(true); startEditing(); }}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={saveChanges}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      {(isExpanded || isEditing) && (
        <CardContent className="pt-0 pb-4">
          {!isEditing ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">SO Number</p>
                <p className="font-medium">{order.so_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="font-medium">{order.customer_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PO Number</p>
                <p className="font-medium">{order.po_number || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tool Model</p>
                <p className="font-medium">{order.tool_model || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tools</p>
                <p className="font-medium">{tools.length} tool(s) {tools.length > 0 && `(${tools.map(t => t.tool_number).join(', ')})`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order Date</p>
                <p className="font-medium">{formatDate(order.order_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                {!order.due_date ? (
                  <p className="font-medium">-</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "font-medium",
                      !isComplete && dueDateColors.text
                    )}>
                      {formatDate(order.due_date)}
                    </p>
                    {!isComplete && dueDateInfo.status !== 'no-date' && (
                      <Badge
                        variant="outline"
                        className={cn("text-xs", dueDateColors.badge)}
                      >
                        {dueDateInfo.status === 'overdue' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {dueDateInfo.status === 'due-soon' && <Clock className="h-3 w-3 mr-1" />}
                        {dueDateInfo.label}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="font-medium">{order.notes || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit_so">SO Number</Label>
                <Input
                  id="edit_so"
                  value={editForm.so_number}
                  onChange={(e) => setEditForm({ ...editForm, so_number: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_customer">Customer</Label>
                <Input
                  id="edit_customer"
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_po">PO Number</Label>
                <Input
                  id="edit_po"
                  value={editForm.po_number}
                  onChange={(e) => setEditForm({ ...editForm, po_number: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_model">Tool Model</Label>
                <Input
                  id="edit_model"
                  value={editForm.tool_model}
                  onChange={(e) => setEditForm({ ...editForm, tool_model: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_order_date">Order Date</Label>
                <Input
                  id="edit_order_date"
                  type="date"
                  value={editForm.order_date}
                  onChange={(e) => setEditForm({ ...editForm, order_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_due_date">Due Date</Label>
                <Input
                  id="edit_due_date"
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1 col-span-2 md:col-span-3">
                <Label htmlFor="edit_notes">Notes</Label>
                <Input
                  id="edit_notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
