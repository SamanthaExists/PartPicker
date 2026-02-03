import { useState, useMemo, useCallback, useEffect } from 'react';
import { AlertTriangle, Check, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Tool, LineItem } from '@/types';
import { cn } from '@/lib/utils';

interface DistributeInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItem: LineItem | null;
  tools: Tool[];
  currentAllocations: Map<string, number>; // toolId -> currently picked qty
  availableStock: number;
  onSave: (newAllocations: Map<string, number>) => Promise<boolean>;
}

export function DistributeInventoryDialog({
  open,
  onOpenChange,
  lineItem,
  tools,
  currentAllocations,
  availableStock,
  onSave,
}: DistributeInventoryDialogProps) {
  // Draft allocations state - what we're editing
  const [draftAllocations, setDraftAllocations] = useState<Map<string, number>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  // Initialize draft allocations when dialog opens or line item changes
  useEffect(() => {
    if (open && lineItem) {
      // Copy current allocations as starting point
      const initial = new Map<string, number>();
      tools.forEach(tool => {
        initial.set(tool.id, currentAllocations.get(tool.id) || 0);
      });
      setDraftAllocations(initial);
    }
  }, [open, lineItem, tools, currentAllocations]);

  // Calculate totals
  const { totalAllocated, totalNeeded, shortage, isOverAllocated, hasChanges } = useMemo(() => {
    let allocated = 0;
    let changed = false;

    draftAllocations.forEach((qty, toolId) => {
      allocated += qty;
      const original = currentAllocations.get(toolId) || 0;
      if (qty !== original) changed = true;
    });

    const needed = lineItem ? lineItem.total_qty_needed : 0;
    const short = Math.max(0, needed - availableStock);
    const over = allocated > availableStock;

    return {
      totalAllocated: allocated,
      totalNeeded: needed,
      shortage: short,
      isOverAllocated: over,
      hasChanges: changed,
    };
  }, [draftAllocations, currentAllocations, lineItem, availableStock]);

  const remaining = availableStock - totalAllocated;

  // Update allocation for a single tool
  const updateAllocation = useCallback((toolId: string, newQty: number) => {
    if (!lineItem) return;

    // Clamp to valid range: 0 to qty_per_unit
    const clampedQty = Math.max(0, Math.min(newQty, lineItem.qty_per_unit));

    setDraftAllocations(prev => {
      const next = new Map(prev);
      next.set(toolId, clampedQty);
      return next;
    });
  }, [lineItem]);

  // Calculate even distribution across all tools
  const calculateEvenDistribution = useCallback(() => {
    if (!lineItem || tools.length === 0) return;

    const qtyPerTool = lineItem.qty_per_unit;
    const maxPerTool = Math.min(qtyPerTool, Math.floor(availableStock / tools.length));
    let remainingStock = availableStock;

    const newAllocations = new Map<string, number>();

    // First pass: give each tool the base amount
    tools.forEach(tool => {
      const allocation = Math.min(maxPerTool, remainingStock, qtyPerTool);
      newAllocations.set(tool.id, allocation);
      remainingStock -= allocation;
    });

    // Second pass: distribute any remainder to tools that still have capacity
    if (remainingStock > 0) {
      for (const tool of tools) {
        const current = newAllocations.get(tool.id) || 0;
        const capacity = qtyPerTool - current;
        if (capacity > 0 && remainingStock > 0) {
          const add = Math.min(capacity, remainingStock);
          newAllocations.set(tool.id, current + add);
          remainingStock -= add;
        }
        if (remainingStock <= 0) break;
      }
    }

    setDraftAllocations(newAllocations);
  }, [lineItem, tools, availableStock]);

  // Clear all allocations
  const clearAll = useCallback(() => {
    const cleared = new Map<string, number>();
    tools.forEach(tool => {
      cleared.set(tool.id, 0);
    });
    setDraftAllocations(cleared);
  }, [tools]);

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave(draftAllocations);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!lineItem) return null;

  const progressPercent = totalNeeded > 0 ? (totalAllocated / totalNeeded) * 100 : 0;
  const stockPercent = totalNeeded > 0 ? Math.min(100, (availableStock / totalNeeded) * 100) : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Distribute: {lineItem.part_number}
          </DialogTitle>
          <DialogDescription>
            {lineItem.description || 'No description'}
            {lineItem.location && ` - Location: ${lineItem.location}`}
          </DialogDescription>
        </DialogHeader>

        {/* Shortage Warning */}
        {shortage > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-amber-800 dark:text-amber-200">
                Shortage: {availableStock} available, {totalNeeded} needed ({shortage} short)
              </span>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            {/* Available stock indicator (lighter) */}
            <div
              className="absolute h-full bg-gray-300 dark:bg-gray-600"
              style={{ width: `${stockPercent}%` }}
            />
            {/* Allocated amount indicator */}
            <div
              className={cn(
                "absolute h-full transition-all",
                isOverAllocated ? "bg-red-500" : "bg-green-500"
              )}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className={cn(
              "font-medium",
              isOverAllocated && "text-red-600 dark:text-red-400"
            )}>
              Allocated: {totalAllocated}
            </span>
            <span className="text-muted-foreground">
              Available: {availableStock} / Needed: {totalNeeded}
            </span>
          </div>
        </div>

        {/* Over-allocation warning */}
        {isOverAllocated && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <X className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-sm font-medium text-red-800 dark:text-red-200">
              Total exceeds available stock by {totalAllocated - availableStock}
            </span>
          </div>
        )}

        {/* Tool Allocation Grid */}
        <div className="border rounded-lg overflow-hidden">
          {/* Header - Hidden on mobile */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-muted text-sm font-medium">
            <div className="col-span-4">Tool</div>
            <div className="col-span-2 text-center">Needed</div>
            <div className="col-span-4 text-center">Allocated</div>
            <div className="col-span-2 text-center">Status</div>
          </div>

          {/* Tool Rows */}
          <div className="divide-y">
            {tools.map(tool => {
              const allocated = draftAllocations.get(tool.id) || 0;
              const needed = lineItem.qty_per_unit;
              const isToolComplete = allocated >= needed;
              const isToolPartial = allocated > 0 && allocated < needed;
              const original = currentAllocations.get(tool.id) || 0;
              const hasToolChange = allocated !== original;

              // Extract short tool identifier
              const toolLabel = tool.tool_number.includes('-')
                ? tool.tool_number.split('-').pop() || tool.tool_number
                : tool.tool_number;

              return (
                <div
                  key={tool.id}
                  className={cn(
                    "px-4 py-3",
                    hasToolChange && "bg-blue-50 dark:bg-blue-950/20"
                  )}
                >
                  {/* Mobile Layout */}
                  <div className="sm:hidden space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{toolLabel}</span>
                        {tool.serial_number && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({tool.serial_number})
                          </span>
                        )}
                      </div>
                      {isToolComplete ? (
                        <Badge variant="default" className="bg-green-500">
                          <Check className="h-3 w-3 mr-1" />
                          Full
                        </Badge>
                      ) : isToolPartial ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {allocated}/{needed}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          0/{needed}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10"
                        onClick={() => updateAllocation(tool.id, allocated - 1)}
                        disabled={allocated <= 0 || isSaving}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        max={needed}
                        value={allocated}
                        onChange={(e) => updateAllocation(tool.id, parseInt(e.target.value) || 0)}
                        className="w-20 h-10 text-center text-lg"
                        disabled={isSaving}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10"
                        onClick={() => updateAllocation(tool.id, allocated + 1)}
                        disabled={allocated >= needed || isSaving}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                      <span className="text-sm text-muted-foreground ml-2">/ {needed}</span>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                    {/* Tool name */}
                    <div className="col-span-4">
                      <span className="font-medium">{toolLabel}</span>
                      {tool.serial_number && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({tool.serial_number})
                        </span>
                      )}
                    </div>

                    {/* Needed qty */}
                    <div className="col-span-2 text-center">
                      <span className="text-muted-foreground">{needed}</span>
                    </div>

                    {/* Allocation controls */}
                    <div className="col-span-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateAllocation(tool.id, allocated - 1)}
                          disabled={allocated <= 0 || isSaving}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          max={needed}
                          value={allocated}
                          onChange={(e) => updateAllocation(tool.id, parseInt(e.target.value) || 0)}
                          className="w-16 h-8 text-center"
                          disabled={isSaving}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateAllocation(tool.id, allocated + 1)}
                          disabled={allocated >= needed || isSaving}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="col-span-2 flex justify-center">
                      {isToolComplete ? (
                        <Badge variant="default" className="bg-green-500">
                          <Check className="h-3 w-3 mr-1" />
                          Full
                        </Badge>
                      ) : isToolPartial ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {allocated}/{needed}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          0/{needed}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer with totals */}
          <div className="flex sm:grid sm:grid-cols-12 gap-2 px-4 py-3 bg-muted border-t items-center justify-between">
            <div className="sm:col-span-4 font-semibold">TOTAL</div>
            <div className="hidden sm:block sm:col-span-2 text-center font-medium">{totalNeeded}</div>
            <div className="sm:col-span-4 text-center font-semibold">
              <span className={cn(
                isOverAllocated && "text-red-600 dark:text-red-400"
              )}>
                {totalAllocated}
              </span>
              <span className="text-muted-foreground font-normal"> / {totalNeeded}</span>
            </div>
            <div className="sm:col-span-2 text-center text-sm text-muted-foreground">
              {remaining >= 0 ? `${remaining} left` : `${Math.abs(remaining)} over`}
            </div>
          </div>
        </div>

        {/* Distribution Presets */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={calculateEvenDistribution}
            disabled={isSaving}
            className="flex-1"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Distribute Evenly
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={isSaving}
            className="flex-1"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges || isOverAllocated}
            variant={hasChanges && !isOverAllocated ? "success" : "default"}
          >
            {isSaving ? 'Saving...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
