import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineItemDialog } from './LineItemDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import type { LineItem } from '@/types';
import type { LineItemInput } from '@/hooks/useLineItems';

interface LineItemManagementProps {
  lineItems: LineItem[];
  onAddLineItem: (input: LineItemInput) => Promise<boolean>;
  onEditLineItem: (lineItemId: string, input: LineItemInput) => Promise<boolean>;
  onDeleteLineItem: (lineItemId: string) => Promise<boolean>;
  isLoading?: boolean;
}

export function LineItemManagement({
  lineItems,
  onAddLineItem,
  onEditLineItem,
  onDeleteLineItem,
  isLoading = false,
}: LineItemManagementProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<LineItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<LineItem | null>(null);
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  const handleAddSave = async (input: LineItemInput): Promise<boolean> => {
    setIsOperationLoading(true);
    const success = await onAddLineItem(input);
    setIsOperationLoading(false);
    if (success) {
      setAddDialogOpen(false);
    }
    return success;
  };

  const handleEditSave = async (input: LineItemInput): Promise<boolean> => {
    if (!editItem) return false;
    setIsOperationLoading(true);
    const success = await onEditLineItem(editItem.id, input);
    setIsOperationLoading(false);
    if (success) {
      setEditItem(null);
    }
    return success;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    setIsOperationLoading(true);
    await onDeleteLineItem(deleteItem.id);
    setIsOperationLoading(false);
    setDeleteItem(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-lg">Line Items ({lineItems.length})</CardTitle>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} disabled={isLoading}>
            <Plus className="h-4 w-4 mr-2" />
            Add Line Item
          </Button>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No line items. Click "Add Line Item" to add one.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted rounded-lg text-sm font-medium">
                <div className="col-span-3">Part Number</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-2">Location</div>
                <div className="col-span-2 text-center">Qty/Unit</div>
                <div className="col-span-2 text-center">Actions</div>
              </div>

              {/* Items */}
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-3 py-3 rounded-lg border bg-white dark:bg-card items-center"
                >
                  <div className="col-span-3">
                    <span className="font-mono font-medium">{item.part_number}</span>
                  </div>
                  <div className="col-span-3 text-sm text-muted-foreground truncate">
                    {item.description || '-'}
                  </div>
                  <div className="col-span-2">
                    {item.location ? (
                      <Badge variant="outline">{item.location}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="font-medium">{item.qty_per_unit}</span>
                    <span className="text-muted-foreground text-sm ml-1">
                      ({item.total_qty_needed} total)
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditItem(item)}
                      disabled={isLoading}
                      title="Edit line item"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
                      onClick={() => setDeleteItem(item)}
                      disabled={isLoading}
                      title="Delete line item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Line Item Dialog */}
      <LineItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleAddSave}
        isLoading={isOperationLoading}
      />

      {/* Edit Line Item Dialog */}
      <LineItemDialog
        open={editItem !== null}
        onOpenChange={(open) => !open && setEditItem(null)}
        onSave={handleEditSave}
        lineItem={editItem}
        isLoading={isOperationLoading}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteItem !== null}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        onConfirm={handleDeleteConfirm}
        lineItem={deleteItem}
        isLoading={isOperationLoading}
      />
    </>
  );
}
