import { useState, useMemo, useCallback, useEffect } from 'react';
import { Check, ChevronDown, ChevronRight, MapPin, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { ConsolidatedPart } from '@/types';
import {
  useConsolidatedPartsPicking,
  type OrderPickingData,
  type ToolPickingInfo,
  type BatchAllocations,
} from '@/hooks/useConsolidatedPartsPicking';
import { useSettings } from '@/hooks/useSettings';
import { PrintTagDialog, type TagData } from '@/components/picking/PrintTagDialog';
import { cn } from '@/lib/utils';

interface MultiOrderPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: ConsolidatedPart | null;
}

export function MultiOrderPickDialog({
  open,
  onOpenChange,
  part,
}: MultiOrderPickDialogProps) {
  const { pickingData, loading, error, fetchPickingDataForPart, saveBatchAllocations, clearPickingData } = useConsolidatedPartsPicking();
  const { getUserName, isTagPrintingEnabled } = useSettings();

  // Draft allocations: line_item_id -> tool_id -> qty
  const [draftAllocations, setDraftAllocations] = useState<BatchAllocations>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [collapsedOrders, setCollapsedOrders] = useState<Set<string>>(new Set());
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printTagData, setPrintTagData] = useState<TagData[] | null>(null);

  // Fetch picking data when dialog opens
  useEffect(() => {
    if (open && part) {
      fetchPickingDataForPart(part).then(data => {
        if (data) {
          // Initialize draft allocations from current picks
          const initial = new Map<string, Map<string, number>>();
          for (const order of data.orders) {
            const toolMap = new Map<string, number>();
            for (const tool of order.tools) {
              toolMap.set(tool.tool_id, tool.current_picked);
            }
            initial.set(order.line_item_id, toolMap);
          }
          setDraftAllocations(initial);

          // Auto-collapse completed orders
          const collapsed = new Set<string>();
          for (const order of data.orders) {
            if (order.picked >= order.needed) {
              collapsed.add(order.order_id);
            }
          }
          setCollapsedOrders(collapsed);
        }
      });
    } else {
      clearPickingData();
      setDraftAllocations(new Map());
      setCollapsedOrders(new Set());
    }
  }, [open, part, fetchPickingDataForPart, clearPickingData]);

  // Calculate totals and detect changes
  const { totalAllocated, totalNeeded, hasChanges } = useMemo(() => {
    if (!pickingData) return { totalAllocated: 0, totalNeeded: 0, hasChanges: false };

    let allocated = 0;
    let changed = false;

    for (const order of pickingData.orders) {
      const toolMap = draftAllocations.get(order.line_item_id);
      for (const tool of order.tools) {
        const draftQty = toolMap?.get(tool.tool_id) ?? tool.current_picked;
        allocated += draftQty;
        if (draftQty !== tool.current_picked) {
          changed = true;
        }
      }
    }

    return {
      totalAllocated: allocated,
      totalNeeded: pickingData.totalNeeded,
      hasChanges: changed,
    };
  }, [pickingData, draftAllocations]);

  const progressPercent = totalNeeded > 0 ? Math.round((totalAllocated / totalNeeded) * 100) : 0;

  // Group orders by order_id for rendering — merges split line items into one section
  // Each tool carries its source line_item_id so allocations stay correct
  interface GroupedTool extends ToolPickingInfo {
    line_item_id: string;
  }
  interface GroupedOrder {
    order_id: string;
    so_number: string;
    needed: number;
    picked: number;
    tools: GroupedTool[];
  }

  const groupedOrders = useMemo((): GroupedOrder[] => {
    if (!pickingData) return [];

    const groups = new Map<string, GroupedOrder>();

    for (const order of pickingData.orders) {
      const existing = groups.get(order.order_id);
      const toolsWithLineItem = order.tools.map(t => ({ ...t, line_item_id: order.line_item_id }));

      if (existing) {
        existing.needed += order.needed;
        existing.picked += order.picked;
        existing.tools.push(...toolsWithLineItem);
      } else {
        groups.set(order.order_id, {
          order_id: order.order_id,
          so_number: order.so_number,
          needed: order.needed,
          picked: order.picked,
          tools: [...toolsWithLineItem],
        });
      }
    }

    // Sort tools within each group by tool_number
    for (const group of groups.values()) {
      group.tools.sort((a, b) => a.tool_number.localeCompare(b.tool_number, undefined, { numeric: true }));
    }

    return Array.from(groups.values());
  }, [pickingData]);

  // Update allocation for a single tool
  const updateAllocation = useCallback((lineItemId: string, toolId: string, qty: number) => {
    setDraftAllocations(prev => {
      const next = new Map(prev);
      const toolMap = new Map(prev.get(lineItemId) || new Map());
      toolMap.set(toolId, Math.max(0, qty));
      next.set(lineItemId, toolMap);
      return next;
    });
  }, []);

  // Get draft qty for a tool
  const getDraftQty = useCallback((lineItemId: string, toolId: string, currentPicked: number): number => {
    return draftAllocations.get(lineItemId)?.get(toolId) ?? currentPicked;
  }, [draftAllocations]);

  // Distribute evenly across all tools
  const distributeEvenly = useCallback(() => {
    if (!pickingData) return;

    const newAllocations = new Map<string, Map<string, number>>();

    for (const order of pickingData.orders) {
      const toolMap = new Map<string, number>();
      const toolCount = order.tools.length;
      if (toolCount === 0) continue;

      // Each tool gets its full qty_per_unit (no stock limitation from this view)
      for (const tool of order.tools) {
        toolMap.set(tool.tool_id, tool.qty_per_unit);
      }
      newAllocations.set(order.line_item_id, toolMap);
    }

    setDraftAllocations(newAllocations);
  }, [pickingData]);

  // Clear all allocations
  const clearAll = useCallback(() => {
    if (!pickingData) return;

    const newAllocations = new Map<string, Map<string, number>>();
    for (const order of pickingData.orders) {
      const toolMap = new Map<string, number>();
      for (const tool of order.tools) {
        toolMap.set(tool.tool_id, 0);
      }
      newAllocations.set(order.line_item_id, toolMap);
    }
    setDraftAllocations(newAllocations);
  }, [pickingData]);

  // Toggle order collapse
  const toggleOrderCollapse = (orderId: string) => {
    setCollapsedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await saveBatchAllocations(draftAllocations, getUserName());
      if (success) {
        // Build print tags for newly picked quantities (delta only)
        if (pickingData && part && isTagPrintingEnabled()) {
          const pickedBy = getUserName();
          const pickedAt = new Date();
          const tags: TagData[] = [];

          for (const order of pickingData.orders) {
            const toolMap = draftAllocations.get(order.line_item_id);
            for (const tool of order.tools) {
              const newQty = toolMap?.get(tool.tool_id) ?? tool.current_picked;
              const delta = newQty - tool.current_picked;
              if (delta > 0) {
                tags.push({
                  partNumber: part.part_number,
                  description: part.description ?? null,
                  location: part.location ?? null,
                  soNumber: order.so_number,
                  toolNumber: tool.tool_number,
                  qtyPicked: delta,
                  pickedBy,
                  pickedAt,
                  assembly: order.assembly_group ?? null,
                });
              }
            }
          }

          if (tags.length > 0) {
            setPrintTagData(tags);
            setShowPrintDialog(true);
            return; // Keep dialog open until print dialog is dismissed
          }
        }

        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!part) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pick: {part.part_number}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <span>{part.description || 'No description'}</span>
              {part.location && (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" />
                  {part.location}
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {totalAllocated} / {totalNeeded} allocated
            </span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <div className="text-center text-sm text-muted-foreground">
            {progressPercent}% complete
          </div>
        </div>

        {/* Loading/Error States */}
        {loading && !pickingData && (
          <div className="py-8 text-center text-muted-foreground">
            Loading picking data...
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
            <p>{error}</p>
            {error.includes('line item') && (
              <p className="mt-1 text-xs">Try refreshing the page to reload the data.</p>
            )}
          </div>
        )}

        {/* Orders List */}
        {pickingData && (
          <div className="space-y-3">
            {groupedOrders.map((group) => {
              const isCollapsed = collapsedOrders.has(group.order_id);

              // Calculate order totals from draft allocations
              let orderAllocated = 0;
              for (const tool of group.tools) {
                orderAllocated += getDraftQty(tool.line_item_id, tool.tool_id, tool.current_picked);
              }
              const orderComplete = orderAllocated >= group.needed;

              return (
                <Collapsible
                  key={group.order_id}
                  open={!isCollapsed}
                  onOpenChange={() => toggleOrderCollapse(group.order_id)}
                >
                  <div className={cn(
                    "border rounded-lg overflow-hidden",
                    orderComplete && "border-green-300 bg-green-50/50 dark:bg-green-950/20"
                  )}>
                    {/* Order Header */}
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <span className="font-semibold">SO-{group.so_number}</span>
                          {orderComplete && (
                            <Badge variant="default" className="bg-green-500">
                              <Check className="h-3 w-3 mr-1" />
                              Complete
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-mono text-sm",
                            orderComplete && "text-green-600 dark:text-green-400"
                          )}>
                            {orderAllocated} / {group.needed}
                          </span>
                          <Progress
                            value={group.needed > 0 ? (orderAllocated / group.needed) * 100 : 0}
                            className="w-20 h-2"
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    {/* Tools Grid */}
                    <CollapsibleContent>
                      <div className="border-t">
                        {/* Header */}
                        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                          <div className="col-span-4">Tool</div>
                          <div className="col-span-2 text-center">Needed</div>
                          <div className="col-span-4 text-center">Allocated</div>
                          <div className="col-span-2 text-center">Status</div>
                        </div>

                        {/* Tool Rows */}
                        <div className="divide-y">
                          {group.tools.map(tool => {
                            const allocated = getDraftQty(tool.line_item_id, tool.tool_id, tool.current_picked);
                            const needed = tool.qty_per_unit;
                            const isToolComplete = allocated >= needed;
                            const isToolPartial = allocated > 0 && allocated < needed;
                            const hasToolChange = allocated !== tool.current_picked;

                            // Extract short tool identifier
                            const toolLabel = tool.tool_number.includes('-')
                              ? tool.tool_number.split('-').pop() || tool.tool_number
                              : tool.tool_number;

                            return (
                              <div
                                key={tool.tool_id}
                                className={cn(
                                  "grid grid-cols-12 gap-2 px-4 py-2 items-center",
                                  hasToolChange && "bg-blue-50 dark:bg-blue-950/20"
                                )}
                              >
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
                                      className="h-7 w-7"
                                      onClick={() => updateAllocation(tool.line_item_id, tool.tool_id, allocated - 1)}
                                      disabled={allocated <= 0 || isSaving}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={needed}
                                      value={allocated}
                                      onChange={(e) => updateAllocation(
                                        tool.line_item_id,
                                        tool.tool_id,
                                        parseInt(e.target.value) || 0
                                      )}
                                      className="w-14 h-7 text-center text-sm"
                                      disabled={isSaving}
                                    />
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7"
                                      onClick={() => updateAllocation(tool.line_item_id, tool.tool_id, allocated + 1)}
                                      disabled={allocated >= needed || isSaving}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Status indicator */}
                                <div className="col-span-2 flex justify-center">
                                  {isToolComplete ? (
                                    <Badge variant="default" className="bg-green-500 text-xs">
                                      <Check className="h-3 w-3 mr-1" />
                                      Full
                                    </Badge>
                                  ) : isToolPartial ? (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                                      {allocated}/{needed}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      0/{needed}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Distribution Presets */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={distributeEvenly}
            disabled={isSaving || loading}
            className="flex-1"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Fill All
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={isSaving || loading}
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
            disabled={isSaving || !hasChanges || loading}
            variant={hasChanges ? "success" : "default"}
          >
            {isSaving ? 'Saving...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PrintTagDialog
        open={showPrintDialog}
        onOpenChange={(open) => {
          setShowPrintDialog(open);
          if (!open) {
            // Close the main dialog after print dialog is dismissed
            setPrintTagData(null);
            onOpenChange(false);
          }
        }}
        tagData={printTagData}
      />
    </Dialog>
  );
}
