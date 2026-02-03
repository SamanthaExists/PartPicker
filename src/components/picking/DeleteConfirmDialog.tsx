import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { LineItem } from '@/types';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  lineItem: LineItem | null;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  lineItem,
  isLoading = false,
}: DeleteConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Delete Line Item
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {lineItem && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Are you sure you want to delete this line item?
            </p>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="font-mono font-medium">{lineItem.part_number}</p>
              {lineItem.description && (
                <p className="text-sm text-muted-foreground">{lineItem.description}</p>
              )}
              <p className="text-sm">
                Qty: {lineItem.qty_per_unit} per unit / {lineItem.total_qty_needed} total
              </p>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 mt-3">
              All pick records associated with this line item will also be deleted.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
