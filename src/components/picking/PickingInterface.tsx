import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Minus, Check, MapPin, MessageSquare, ArrowUpDown, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Undo2, Trash2, Clock, User, Package, Eye, EyeOff, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Tool, LineItem, LineItemWithPicks, Pick, IssueType } from '@/types';
import { Layers, SplitSquareVertical } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { cn, formatDateTime, getLocationPrefix, alphanumericCompare, getTopLevelAssembly } from '@/lib/utils';
import { ReportIssueDialog } from './ReportIssueDialog';
import { DistributeInventoryDialog } from './DistributeInventoryDialog';
import { PrintTagDialog, type TagData } from './PrintTagDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type SortMode = 'part_number' | 'location' | 'assembly';

const SORT_PREFERENCE_KEY = 'picking-sort-preference';

interface PickingInterfaceProps {
  tool: Tool;
  allTools: Tool[];
  orderId: string;
  soNumber: string;
  lineItems: LineItem[];
  lineItemsWithPicks: LineItemWithPicks[];
  picks: Pick[];
  onRecordPick: (
    lineItemId: string,
    toolId: string,
    qtyPicked: number,
    pickedBy?: string,
    notes?: string
  ) => Promise<(Pick & { overPickWarning?: string }) | null>;
  onUndoPick: (pickId: string, undoneBy?: string) => Promise<boolean>;
  getPicksForTool: (toolId: string) => Map<string, number>;
  getPicksForAllTools: () => Map<string, Map<string, number>>;
  getPickHistory: (lineItemId: string, toolId: string) => Pick[];
  onPickAllRemainingTools?: (lineItemId: string) => Promise<{ toolNumber: string; qty: number }[]>;
  onReportIssue?: (
    lineItemId: string,
    orderId: string,
    issueType: IssueType,
    description?: string,
    reportedBy?: string
  ) => Promise<boolean>;
  hasOpenIssue?: (lineItemId: string) => boolean;
  onBatchUpdateAllocations?: (
    lineItemId: string,
    newAllocations: Map<string, number>,
    pickedBy?: string,
    notes?: string
  ) => Promise<boolean>;
  onDeleteLineItem?: (lineItemId: string) => Promise<boolean>;
  toolFilter?: string; // 'all' or specific tool ID to filter by
}

export function PickingInterface({
  tool,
  allTools,
  orderId,
  soNumber,
  lineItems,
  lineItemsWithPicks,
  picks: _picks,
  onRecordPick,
  onUndoPick,
  getPicksForTool,
  getPicksForAllTools,
  getPickHistory,
  onPickAllRemainingTools,
  onReportIssue,
  hasOpenIssue,
  onBatchUpdateAllocations,
  onDeleteLineItem,
  toolFilter = 'all',
}: PickingInterfaceProps) {
  void _picks;

  // Filter line items based on toolFilter
  // When toolFilter is a specific tool ID, only show items that:
  // 1. Have tool_ids that include this tool, OR
  // 2. Have no tool_ids (applies to all tools)
  const filteredLineItems = useMemo(() => {
    if (toolFilter === 'all') return lineItems;

    return lineItems.filter(item => {
      // If item has no tool_ids, it applies to all tools
      if (!item.tool_ids || item.tool_ids.length === 0) return true;
      // Otherwise, check if the filtered tool is in the list
      return item.tool_ids.includes(toolFilter);
    });
  }, [lineItems, toolFilter]);

  // Create a map for quick lookup of total picks by line item ID
  const totalPicksMap = useMemo(() => {
    const map = new Map<string, { totalPicked: number; totalNeeded: number }>();
    for (const item of lineItemsWithPicks) {
      map.set(item.id, {
        totalPicked: item.total_picked,
        totalNeeded: item.total_qty_needed,
      });
    }
    return map;
  }, [lineItemsWithPicks]);
  const { getUserName, isTagPrintingEnabled } = useSettings();
  const [partialPickItem, setPartialPickItem] = useState<LineItem | null>(null);
  // Tag printing state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printTagData, setPrintTagData] = useState<TagData | TagData[] | null>(null);
  const [partialQty, setPartialQty] = useState('1');
  const [partialNote, setPartialNote] = useState('');
  // Track pending pick quantities per item (item.id -> { qty, note })
  const [pendingPicks, setPendingPicks] = useState<Map<string, { qty: number; note: string }>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [issueReportItem, setIssueReportItem] = useState<LineItem | null>(null);
  const [distributeItem, setDistributeItem] = useState<LineItem | null>(null);
  const [scrollToItemId, setScrollToItemId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [deleteConfirmPick, setDeleteConfirmPick] = useState<Pick | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [overPickWarning, setOverPickWarning] = useState<string | null>(null);
  // Undo password confirmation state
  const [undoPasswordItem, setUndoPasswordItem] = useState<LineItem | null>(null);
  const [undoPassword, setUndoPassword] = useState('');
  const [undoPasswordError, setUndoPasswordError] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [deleteConfirmLineItem, setDeleteConfirmLineItem] = useState<LineItem | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(SORT_PREFERENCE_KEY);
    return (saved as SortMode) || 'part_number';
  });
  const [hideCompleted, setHideCompleted] = useState(() => {
    const saved = localStorage.getItem('picking-hide-completed');
    return saved === 'true';
  });
  const [showOutOfStockOnly, setShowOutOfStockOnly] = useState(() => {
    const saved = localStorage.getItem('picking-show-out-of-stock');
    return saved === 'true';
  });

  // Persist sort preference
  useEffect(() => {
    localStorage.setItem(SORT_PREFERENCE_KEY, sortMode);
  }, [sortMode]);

  // Persist hide completed preference
  useEffect(() => {
    localStorage.setItem('picking-hide-completed', String(hideCompleted));
  }, [hideCompleted]);

  // Persist out of stock filter preference
  useEffect(() => {
    localStorage.setItem('picking-show-out-of-stock', String(showOutOfStockOnly));
  }, [showOutOfStockOnly]);

  const toolPicks = getPicksForTool(tool.id);
  const allToolsPicksMap = useMemo(() => getPicksForAllTools(), [getPicksForAllTools]);

  // Check if this order has multiple tools
  const hasMultipleTools = allTools.length > 1;

  // Calculate progress for mobile header
  const totalItems = filteredLineItems.length;
  const completedItems = filteredLineItems.filter(item => {
    const pickedForTool = toolPicks.get(item.id) || 0;
    return item.qty_per_unit - pickedForTool <= 0;
  }).length;

  // Sort and group items
  const { sortedItems, locationGroups, assemblyGroups, hiddenCount, outOfStockCount } = useMemo(() => {
    // Filter out completed items if hideCompleted is true
    let items = [...filteredLineItems];
    let hiddenItemsCount = 0;
    let outOfStockItemsCount = 0;

    // Count items with zero stock
    outOfStockItemsCount = items.filter(item => item.qty_available === 0).length;

    if (hideCompleted) {
      const before = items.length;
      items = items.filter(item => {
        const pickedForTool = toolPicks.get(item.id) || 0;
        return item.qty_per_unit - pickedForTool > 0;
      });
      hiddenItemsCount = before - items.length;
    }

    // Filter to show only out of stock items if enabled
    if (showOutOfStockOnly) {
      items = items.filter(item => item.qty_available === 0);
    }

    if (sortMode === 'location') {
      // Sort by location (alphanumeric), items without location go to end
      items.sort((a, b) => {
        const locA = a.location || '';
        const locB = b.location || '';

        // Items without location go to the end
        if (!locA && locB) return 1;
        if (locA && !locB) return -1;
        if (!locA && !locB) return alphanumericCompare(a.part_number, b.part_number);

        const cmp = alphanumericCompare(locA, locB);
        if (cmp !== 0) return cmp;
        return alphanumericCompare(a.part_number, b.part_number);
      });

      // Group by location prefix
      const groups = new Map<string, LineItem[]>();
      items.forEach(item => {
        const prefix = getLocationPrefix(item.location) || 'No Location';
        if (!groups.has(prefix)) {
          groups.set(prefix, []);
        }
        const group = groups.get(prefix);
        if (group) {
          group.push(item);
        }
      });

      return { sortedItems: items, locationGroups: groups, assemblyGroups: null, hiddenCount: hiddenItemsCount, outOfStockCount: outOfStockItemsCount };
    } else if (sortMode === 'assembly') {
      // Sort by top-level assembly, then full path, then part number
      items.sort((a, b) => {
        const topA = getTopLevelAssembly(a.assembly_group);
        const topB = getTopLevelAssembly(b.assembly_group);

        if (!topA && topB) return 1;
        if (topA && !topB) return -1;
        if (!topA && !topB) return alphanumericCompare(a.part_number, b.part_number);

        const cmp = alphanumericCompare(topA, topB);
        if (cmp !== 0) return cmp;
        // Secondary sort by full path so sub-assemblies cluster together
        const pathCmp = alphanumericCompare(a.assembly_group || '', b.assembly_group || '');
        if (pathCmp !== 0) return pathCmp;
        return alphanumericCompare(a.part_number, b.part_number);
      });

      // Group by top-level assembly so sub-assembly parts cluster under the same header
      const groups = new Map<string, LineItem[]>();
      items.forEach(item => {
        const group_key = getTopLevelAssembly(item.assembly_group) || 'No Assembly Group';
        if (!groups.has(group_key)) {
          groups.set(group_key, []);
        }
        const group = groups.get(group_key);
        if (group) {
          group.push(item);
        }
      });

      return { sortedItems: items, locationGroups: null, assemblyGroups: groups, hiddenCount: hiddenItemsCount, outOfStockCount: outOfStockItemsCount };
    } else {
      // Sort by part number (alphanumeric)
      items.sort((a, b) => alphanumericCompare(a.part_number, b.part_number));
      return { sortedItems: items, locationGroups: null, assemblyGroups: null, hiddenCount: hiddenItemsCount, outOfStockCount: outOfStockItemsCount };
    }
  }, [filteredLineItems, sortMode, hideCompleted, showOutOfStockOnly, toolPicks]);

  // Scroll to item after data refresh (e.g., after distribute dialog save)
  useEffect(() => {
    if (scrollToItemId) {
      const timeoutId = setTimeout(() => {
        const element = itemRefs.current.get(scrollToItemId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // If element not found (hidden by "Hide completed" filter), do nothing gracefully
        setScrollToItemId(null);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [scrollToItemId, sortedItems]);

  const handleQuickPick = useCallback(async (item: LineItem) => {
    const pickedForTool = toolPicks.get(item.id) || 0;
    const remaining = item.qty_per_unit - pickedForTool;

    if (remaining <= 0) return;

    // Check if there's a pending pick quantity set for this item
    const pending = pendingPicks.get(item.id);
    const qtyToPick = pending ? Math.min(pending.qty, remaining) : remaining;
    const note = pending?.note;
    const pickedBy = getUserName();

    setIsSubmitting(item.id);
    const result = await onRecordPick(item.id, tool.id, qtyToPick, pickedBy, note || undefined);

    // Check for over-pick warning (concurrent pick detection)
    if (result && 'overPickWarning' in result && result.overPickWarning) {
      setOverPickWarning(result.overPickWarning);
      // Auto-dismiss after 8 seconds
      setTimeout(() => setOverPickWarning(null), 8000);
    }

    // Trigger tag printing dialog if enabled and pick was successful
    if (result && isTagPrintingEnabled()) {
      setPrintTagData({
        partNumber: item.part_number,
        description: item.description,
        location: item.location,
        soNumber: soNumber,
        toolNumber: tool.tool_number,
        qtyPicked: qtyToPick,
        pickedBy: pickedBy,
        pickedAt: new Date(),
      });
      setShowPrintDialog(true);
    }

    // Clear the pending pick after recording
    if (pending) {
      setPendingPicks(prev => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
    }

    // Scroll back to this item after data refresh
    setScrollToItemId(item.id);

    setIsSubmitting(null);
  }, [toolPicks, tool.id, tool.tool_number, onRecordPick, getUserName, pendingPicks, isTagPrintingEnabled, soNumber]);

  // Keyboard navigation for picking
  // Arrow keys to navigate, Enter/Space to pick, Escape to clear selection
  const { selectedId: keyboardSelectedId } = useKeyboardNavigation({
    items: sortedItems,
    enabled: true,
    getItemId: (item) => item.id,
    onAction: (item) => {
      const pickedForTool = toolPicks.get(item.id) || 0;
      const remaining = item.qty_per_unit - pickedForTool;
      if (remaining > 0 && !isSubmitting) {
        handleQuickPick(item);
      }
    },
  });

  // Pick for all remaining tools at once
  const handlePickAllTools = useCallback(async (item: LineItem) => {
    if (onPickAllRemainingTools) {
      setIsSubmitting(item.id);
      const pickedTools = await onPickAllRemainingTools(item.id);
      setIsSubmitting(null);

      // Trigger tag printing for all tools that were picked
      if (pickedTools.length > 0 && isTagPrintingEnabled()) {
        const pickedBy = getUserName();
        const pickedAt = new Date();
        const tags = pickedTools.map(({ toolNumber, qty }) => ({
          partNumber: item.part_number,
          description: item.description,
          location: item.location,
          soNumber: soNumber,
          toolNumber,
          qtyPicked: qty,
          pickedBy,
          pickedAt,
        }));
        setPrintTagData(tags);
        setShowPrintDialog(true);
      }
    }
  }, [onPickAllRemainingTools, soNumber, getUserName, isTagPrintingEnabled]);

  // Pick all items in a location group for the current tool
  const [isPickingLocation, setIsPickingLocation] = useState<string | null>(null);

  const handlePickAllInLocation = useCallback(async (locationItems: LineItem[]) => {
    const itemsToPick = locationItems.filter(item => {
      const pickedForTool = toolPicks.get(item.id) || 0;
      return item.qty_per_unit - pickedForTool > 0;
    });

    if (itemsToPick.length === 0) return;

    const locationPrefix = itemsToPick[0]?.location?.split('-')[0] || 'location';
    setIsPickingLocation(locationPrefix);
    const pickedBy = getUserName();
    const pickedAt = new Date();

    try {
      // Pick all items sequentially to avoid race conditions
      let hasWarnings = false;
      const successfulPicks: { item: LineItem; qty: number }[] = [];
      for (const item of itemsToPick) {
        const pickedForTool = toolPicks.get(item.id) || 0;
        const remaining = item.qty_per_unit - pickedForTool;
        if (remaining > 0) {
          const result = await onRecordPick(item.id, tool.id, remaining, pickedBy);
          if (result) {
            successfulPicks.push({ item, qty: remaining });
            if ('overPickWarning' in result && result.overPickWarning) {
              hasWarnings = true;
            }
          }
        }
      }
      if (hasWarnings) {
        setOverPickWarning('Some items may have been over-picked. Another user may have picked items at the same time. Please review the quantities.');
        setTimeout(() => setOverPickWarning(null), 8000);
      }

      // Trigger tag printing for all successful picks
      if (successfulPicks.length > 0 && isTagPrintingEnabled()) {
        const tags = successfulPicks.map(({ item, qty }) => ({
          partNumber: item.part_number,
          description: item.description,
          location: item.location,
          soNumber: soNumber,
          toolNumber: tool.tool_number,
          qtyPicked: qty,
          pickedBy,
          pickedAt,
        }));
        setPrintTagData(tags);
        setShowPrintDialog(true);
      }
    } finally {
      setIsPickingLocation(null);
    }
  }, [toolPicks, tool.id, tool.tool_number, soNumber, onRecordPick, getUserName, isTagPrintingEnabled]);

  // Get count of unpicked items in a location group
  const getUnpickedCountInLocation = useCallback((locationItems: LineItem[]) => {
    return locationItems.filter(item => {
      const pickedForTool = toolPicks.get(item.id) || 0;
      return item.qty_per_unit - pickedForTool > 0;
    }).length;
  }, [toolPicks]);

  // Count how many tools still need this part
  const getRemainingToolsCount = useCallback((item: LineItem) => {
    const applicableTools = item.tool_ids && item.tool_ids.length > 0
      ? allTools.filter(t => item.tool_ids!.includes(t.id))
      : allTools;
    return applicableTools.filter(t => {
      const toolPicks = allToolsPicksMap.get(t.id);
      const picked = toolPicks?.get(item.id) || 0;
      return picked < item.qty_per_unit;
    }).length;
  }, [allTools, allToolsPicksMap]);

  // Get current allocations for a line item across applicable tools
  const getCurrentAllocations = useCallback((lineItem: LineItem): Map<string, number> => {
    const applicableTools = lineItem.tool_ids && lineItem.tool_ids.length > 0
      ? allTools.filter(t => lineItem.tool_ids!.includes(t.id))
      : allTools;
    const allocations = new Map<string, number>();
    applicableTools.forEach(t => {
      const toolPicks = allToolsPicksMap.get(t.id);
      const picked = toolPicks?.get(lineItem.id) || 0;
      allocations.set(t.id, picked);
    });
    return allocations;
  }, [allTools, allToolsPicksMap]);

  // Check if distribute button should show for an item
  // Shows for all orders with incomplete tools (always require dialog, no quick-pick)
  const shouldShowDistribute = useCallback((item: LineItem): boolean => {
    if (!onBatchUpdateAllocations) return false;
    // Check if there are incomplete tools
    const remainingCount = getRemainingToolsCount(item);
    return remainingCount > 0;
  }, [onBatchUpdateAllocations, getRemainingToolsCount]);

  // Handle save from distribute dialog
  const handleDistributeSave = useCallback(async (newAllocations: Map<string, number>): Promise<boolean> => {
    if (!distributeItem || !onBatchUpdateAllocations) return false;

    const itemIdToScrollTo = distributeItem.id;  // Track before saving
    const pickedBy = getUserName();
    const pickedAt = new Date();

    // Calculate new picks per tool (new allocations minus current)
    const currentAllocations = getCurrentAllocations(distributeItem);
    const newPicksPerTool: { toolId: string; qtyPicked: number }[] = [];
    newAllocations.forEach((newQty, toolId) => {
      const currentQty = currentAllocations.get(toolId) || 0;
      if (newQty > currentQty) {
        newPicksPerTool.push({ toolId, qtyPicked: newQty - currentQty });
      }
    });

    const success = await onBatchUpdateAllocations(
      distributeItem.id,
      newAllocations,
      pickedBy
    );

    if (success) {
      setScrollToItemId(itemIdToScrollTo);  // Trigger scroll after refresh

      // Trigger tag printing dialog if enabled and picks were made
      if (newPicksPerTool.length > 0 && isTagPrintingEnabled()) {
        // Create one tag per tool that received picks
        const tags: TagData[] = newPicksPerTool.map(({ toolId, qtyPicked }) => {
          const tool = allTools.find(t => t.id === toolId);
          return {
            partNumber: distributeItem.part_number,
            description: distributeItem.description,
            location: distributeItem.location,
            soNumber: soNumber,
            toolNumber: tool?.tool_number || 'Unknown',
            qtyPicked: qtyPicked,
            pickedBy: pickedBy,
            pickedAt: pickedAt,
          };
        });
        setPrintTagData(tags);
        setShowPrintDialog(true);
      }
    }

    return success;
  }, [distributeItem, onBatchUpdateAllocations, getUserName, getCurrentAllocations, isTagPrintingEnabled, soNumber, allTools]);

  // Sets the pending pick quantity (does not record yet - user clicks checkmark to confirm)
  const handleSetPendingPick = () => {
    if (!partialPickItem) return;

    const qty = parseInt(partialQty, 10);
    if (isNaN(qty) || qty <= 0) return;

    // Store the pending pick quantity and note
    setPendingPicks(prev => {
      const next = new Map(prev);
      next.set(partialPickItem.id, { qty, note: partialNote.trim() });
      return next;
    });

    setPartialPickItem(null);
    setPartialQty('1');
    setPartialNote('');
  };

  // Clear pending pick for an item
  const clearPendingPick = (itemId: string) => {
    setPendingPicks(prev => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  };

  const openPartialPick = (item: LineItem) => {
    const pickedForTool = toolPicks.get(item.id) || 0;
    const remaining = item.qty_per_unit - pickedForTool;
    setPartialPickItem(item);
    setPartialQty(String(Math.min(1, remaining)));
    setPartialNote('');
  };

  const handleReportIssue = async (
    lineItemId: string,
    issueType: IssueType,
    description?: string
  ): Promise<boolean> => {
    if (!onReportIssue) return false;
    const success = await onReportIssue(
      lineItemId,
      orderId,
      issueType,
      description,
      getUserName()
    );
    return success;
  };

  // Toggle expanded state for a line item to show/hide pick history
  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Open password dialog for undo confirmation
  const handleUndoLastPick = async (item: LineItem) => {
    // Check if there are any picks for this item across all tools
    const itemWithPicks = lineItemsWithPicks.find(li => li.id === item.id);
    if (!itemWithPicks || itemWithPicks.picks.length === 0) return;

    // Open password dialog
    setUndoPasswordItem(item);
    setUndoPassword('');
    setUndoPasswordError(null);
  };

  // Handle password confirmation and bulk undo all picks for this part
  const handleConfirmUndo = async () => {
    if (!undoPasswordItem) return;

    // Verify password
    if (undoPassword !== '1977') {
      setUndoPasswordError('Incorrect password');
      return;
    }

    // Get all picks for this line item (across ALL tools)
    const itemWithPicks = lineItemsWithPicks.find(li => li.id === undoPasswordItem.id);
    if (!itemWithPicks || itemWithPicks.picks.length === 0) {
      setUndoPasswordItem(null);
      return;
    }

    setIsUndoing(true);
    setUndoPasswordError(null);

    try {
      const userName = getUserName();
      // Undo ALL picks for this part number (line item) across all tools
      for (const pick of itemWithPicks.picks) {
        await onUndoPick(pick.id, userName);
      }
      // Close dialog on success
      setUndoPasswordItem(null);
      setUndoPassword('');
    } catch (err) {
      setUndoPasswordError('Failed to undo picks. Please try again.');
    } finally {
      setIsUndoing(false);
    }
  };

  // Delete a specific pick record (with password verification)
  const handleDeletePick = async () => {
    if (!deleteConfirmPick) return;

    // Verify password
    if (deletePassword !== '1977') {
      setDeletePasswordError('Incorrect password');
      return;
    }

    setIsDeleting(true);
    setDeletePasswordError(null);
    await onUndoPick(deleteConfirmPick.id, getUserName());
    setIsDeleting(false);
    setDeleteConfirmPick(null);
    setDeletePassword('');
  };

  // Render desktop line item row with expandable pick history
  const renderDesktopLineItem = (item: LineItem) => {
    const pickedForTool = toolPicks.get(item.id) || 0;
    const remaining = item.qty_per_unit - pickedForTool;
    const isComplete = remaining <= 0;
    const itemHasIssue = hasOpenIssue ? hasOpenIssue(item.id) : false;
    const isExpanded = expandedItems.has(item.id);
    const pickHistory = getPickHistory(item.id, tool.id);
    const hasHistory = pickHistory.length > 0;

    // Get total picks across all tools
    const totalData = totalPicksMap.get(item.id);
    const totalPicked = totalData?.totalPicked || 0;
    const totalNeeded = totalData?.totalNeeded || item.total_qty_needed;
    const allToolsComplete = totalPicked >= totalNeeded;

    // Count remaining tools that need this part
    const remainingToolsCount = getRemainingToolsCount(item);

    // Check for low stock warning (not enough available to complete remaining picks)
    const remainingToPick = totalNeeded - totalPicked;
    const isLowStock = item.qty_available !== null && item.qty_available < remainingToPick && !allToolsComplete;
    const isKeyboardSelected = keyboardSelectedId === item.id;

    return (
      <div className="hidden md:block space-y-0">
        {/* Main Row */}
        <div
          className={cn(
            'grid gap-2 px-3 py-3 rounded-lg border items-center grid-cols-12 transition-all',
            allToolsComplete ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-white dark:bg-card',
            itemHasIssue && !allToolsComplete && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
            isLowStock && !itemHasIssue && 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
            isSubmitting === item.id && 'opacity-50',
            isExpanded && 'rounded-b-none',
            isKeyboardSelected && 'ring-2 ring-blue-500 ring-offset-1'
          )}
        >
          {/* Expand Toggle + Part Number */}
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              {hasHistory ? (
                <button
                  onClick={() => toggleExpanded(item.id)}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  title={isExpanded ? 'Hide pick history' : 'Show pick history'}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <div className="w-5" /> // Spacer for alignment
              )}
              <span className="font-mono font-medium">{item.part_number}</span>
              {itemHasIssue && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  Issue
                </Badge>
              )}
              {isLowStock && !itemHasIssue && (
                <Badge className="gap-1 text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Low
                </Badge>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="col-span-3 text-sm text-muted-foreground min-w-0">
            <div className="truncate">{item.description || '-'}</div>
            {item.assembly_group && (
              <div className="text-xs text-muted-foreground/70 truncate font-mono">
                Assy: {item.assembly_group}
              </div>
            )}
            {item.tool_ids && item.tool_ids.length > 0 && (
              <div className="mt-0.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                  {item.tool_ids.length} of {allTools.length} tools
                </Badge>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="col-span-2">
            {item.location ? (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {item.location}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </div>

          {/* Stock (qty_available) */}
          <div className="col-span-1 text-center">
            {item.qty_available !== null && item.qty_available !== undefined ? (
              <span
                className={cn(
                  'text-sm font-medium',
                  item.qty_available < totalNeeded
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                )}
                title={item.qty_available < totalNeeded ? 'Low stock - may not have enough' : 'Sufficient stock'}
              >
                {item.qty_available}
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </div>

          {/* Total for multi-tool orders */}
          {hasMultipleTools && (
            <div className="col-span-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <span
                  className={cn(
                    'font-semibold',
                    allToolsComplete ? 'text-green-600 dark:text-green-400' : ''
                  )}
                >
                  {totalPicked}
                </span>
                <span className="text-muted-foreground text-sm">/</span>
                <span className="text-sm">{totalNeeded}</span>
              </div>
            </div>
          )}

          {/* Total Column - only show for single tool orders */}
          {!hasMultipleTools && (
            <div className="col-span-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <span
                  className={cn(
                    'font-semibold',
                    isComplete ? 'text-green-600 dark:text-green-400' : ''
                  )}
                >
                  {pickedForTool}
                </span>
                <span className="text-muted-foreground text-sm">/</span>
                <span className="text-sm">{item.qty_per_unit}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={cn("flex justify-end gap-1", "col-span-2")}>
            {/* Undo last pick button - show when there are picks */}
            {hasHistory && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUndoLastPick(item)}
                disabled={isSubmitting === item.id}
                title="Undo last pick"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}

            {/* Pick button - always require dialog for picking */}
            {shouldShowDistribute(item) ? (
              <Button
                size="sm"
                variant="success"
                onClick={() => setDistributeItem(item)}
                disabled={isSubmitting === item.id}
                title="Pick for all tools"
              >
                <SplitSquareVertical className="h-4 w-4 mr-1" />
                Pick
              </Button>
            ) : (
              <>
                {/* Pick All Tools button - only show when multiple tools and some remaining */}
                {hasMultipleTools && remainingToolsCount > 0 && onPickAllRemainingTools && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => handlePickAllTools(item)}
                    disabled={isSubmitting === item.id}
                    title={`Pick for all ${remainingToolsCount} remaining tools`}
                  >
                    <Layers className="h-4 w-4 mr-1" />
                    All ({remainingToolsCount})
                  </Button>
                )}

                {/* Pick This Tool button - when not complete for current tool */}
                {!isComplete && (
                  <>
                    {/* Show pending qty indicator and clear button if a pending pick is set */}
                    {pendingPicks.has(item.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => clearPendingPick(item.id)}
                        disabled={isSubmitting === item.id}
                        title="Clear pending quantity"
                        className="text-muted-foreground"
                      >
                        ✕
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={pendingPicks.has(item.id) ? "default" : (hasMultipleTools ? "outline" : "success")}
                      onClick={() => handleQuickPick(item)}
                      disabled={isSubmitting === item.id}
                      title={pendingPicks.has(item.id)
                        ? `Pick ${pendingPicks.get(item.id)?.qty ?? 0} (custom qty set)`
                        : `Pick all ${remaining} for this tool`}
                      className={pendingPicks.has(item.id) ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {pendingPicks.get(item.id)?.qty ?? remaining}
                    </Button>
                    {item.qty_per_unit > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPartialPick(item)}
                        disabled={isSubmitting === item.id}
                        title="Set pick quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </>
            )}

            {/* Edit Picks button - when all tools are complete */}
            {allToolsComplete && onBatchUpdateAllocations && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDistributeItem(item)}
                className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit Picks
              </Button>
            )}

            {/* Report Issue button */}
            {onReportIssue && !allToolsComplete && (
              <Button
                size="sm"
                variant={itemHasIssue ? "destructive" : "ghost"}
                onClick={() => setIssueReportItem(item)}
                disabled={isSubmitting === item.id}
                title="Report issue"
              >
                <AlertTriangle className="h-4 w-4" />
              </Button>
            )}

            {/* Remove Part button */}
            {onDeleteLineItem && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => {
                  const totalPicks = totalPicksMap.get(item.id);
                  if (totalPicks && totalPicks.totalPicked > 0) {
                    setOverPickWarning('Cannot remove part with existing picks. Undo all picks first.');
                    setTimeout(() => setOverPickWarning(null), 5000);
                    return;
                  }
                  setDeleteConfirmLineItem(item);
                }}
                disabled={isSubmitting === item.id}
                title="Remove part from order"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Pick History Panel */}
        {isExpanded && hasHistory && (
          <div className="border border-t-0 rounded-b-lg bg-gray-50 dark:bg-gray-900 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pick History ({pickHistory.length} {pickHistory.length === 1 ? 'record' : 'records'})
            </div>
            <div className="space-y-2">
              {pickHistory.map((pick, index) => (
                <div
                  key={pick.id}
                  className={cn(
                    'flex items-center justify-between bg-white dark:bg-card rounded-md px-3 py-2 border',
                    index === 0 && 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Badge variant={index === 0 ? 'default' : 'secondary'}>
                      {pick.qty_picked}x
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      {pick.picked_by || 'Unknown'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(pick.picked_at)}
                    </div>
                    {pick.notes && (
                      <div className="text-sm italic text-muted-foreground">
                        "{pick.notes}"
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={() => setDeleteConfirmPick(pick)}
                    title="Delete this pick record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render mobile line item
  const renderMobileLineItem = (item: LineItem) => {
    const pickedForTool = toolPicks.get(item.id) || 0;
    const remaining = item.qty_per_unit - pickedForTool;
    const isComplete = remaining <= 0;
    const itemHasIssue = hasOpenIssue ? hasOpenIssue(item.id) : false;

    // Get total picks across all tools
    const totalData = totalPicksMap.get(item.id);
    const totalPicked = totalData?.totalPicked || 0;
    const totalNeeded = totalData?.totalNeeded || item.total_qty_needed;
    const allToolsComplete = totalPicked >= totalNeeded;

    // Count remaining tools that need this part
    const remainingToolsCount = getRemainingToolsCount(item);

    // Check for low stock warning (not enough available to complete remaining picks)
    const remainingToPick = totalNeeded - totalPicked;
    const isLowStock = item.qty_available !== null && item.qty_available < remainingToPick && !allToolsComplete;
    const isKeyboardSelected = keyboardSelectedId === item.id;

    return (
      <div
        className="rounded-xl md:hidden"
      >
        {/* Main item content */}
        <div
          className={cn(
            'relative flex flex-col p-4 border rounded-xl shadow-sm bg-white dark:bg-card',
            allToolsComplete ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : '',
            isKeyboardSelected && 'ring-2 ring-blue-500 ring-offset-1',
            itemHasIssue && !allToolsComplete && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
            isLowStock && !itemHasIssue && 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
            isSubmitting === item.id && 'opacity-50'
          )}
        >
          {/* Top row: Part number and status */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-xl tracking-tight">
                  {item.part_number}
                </span>
                {itemHasIssue && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Issue
                  </Badge>
                )}
                {isLowStock && !itemHasIssue && (
                  <Badge className="gap-1 text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Low Stock
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              )}
              {item.assembly_group && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
                  Assy: {item.assembly_group}
                </p>
              )}
              {item.tool_ids && item.tool_ids.length > 0 && (
                <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                  {item.tool_ids.length} of {allTools.length} tools
                </Badge>
              )}
            </div>
            {allToolsComplete && (
              <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400 flex-shrink-0 ml-2" />
            )}
          </div>

          {/* Location row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {item.location ? (
                <Badge variant="outline" className="gap-1.5 text-sm py-1.5 px-3">
                  <MapPin className="h-4 w-4" />
                  {item.location}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">No location</span>
              )}
              {/* Stock indicator */}
              {item.qty_available !== null && item.qty_available !== undefined && (
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    item.qty_available < totalNeeded
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  )}
                  title={item.qty_available < totalNeeded ? 'Low stock' : 'In stock'}
                >
                  Stock: {item.qty_available}
                </span>
              )}
            </div>
            {/* Quantity display */}
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span
                  className={cn(
                    'text-xl font-bold tabular-nums',
                    allToolsComplete ? 'text-green-600 dark:text-green-400' : 'text-primary'
                  )}
                >
                  {totalPicked}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-lg tabular-nums">{totalNeeded}</span>
              </div>
            </div>
          </div>


          {/* Bottom row: Actions */}
          {!allToolsComplete ? (
            <div className="flex flex-col gap-2">
              {/* Pick button - always require dialog for picking */}
              {shouldShowDistribute(item) ? (
                <div className="flex gap-3">
                  <Button
                    size="touch-lg"
                    variant="success"
                    onClick={() => setDistributeItem(item)}
                    disabled={isSubmitting === item.id}
                    className="flex-1 gap-2 h-14"
                  >
                    <SplitSquareVertical className="h-6 w-6" />
                    <span className="text-lg">Pick</span>
                  </Button>
                  {onReportIssue && (
                    <Button
                      size="touch-lg"
                      variant={itemHasIssue ? "destructive" : "outline"}
                      onClick={() => setIssueReportItem(item)}
                      disabled={isSubmitting === item.id}
                      className="px-5 h-14"
                    >
                      <AlertTriangle className="h-6 w-6" />
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Pick All Tools button - only show when multiple tools and some remaining */}
                  {hasMultipleTools && remainingToolsCount > 0 && onPickAllRemainingTools && (
                    <Button
                      size="touch-lg"
                      variant="success"
                      onClick={() => handlePickAllTools(item)}
                      disabled={isSubmitting === item.id}
                      className="w-full gap-2 h-14"
                    >
                      <Layers className="h-6 w-6" />
                      <span className="text-lg">Pick All ({remainingToolsCount} tools)</span>
                    </Button>
                  )}

                  {/* Pick This Tool Only button - when not complete for current tool */}
                  {!isComplete && (
                    <div className="flex gap-3">
                      {/* Show clear button if pending pick is set */}
                      {pendingPicks.has(item.id) && (
                        <Button
                          size="touch-lg"
                          variant="ghost"
                          onClick={() => clearPendingPick(item.id)}
                          disabled={isSubmitting === item.id}
                          className="px-4 h-14"
                          title="Clear pending quantity"
                        >
                          ✕
                        </Button>
                      )}
                      <Button
                        size="touch-lg"
                        variant={pendingPicks.has(item.id) ? "default" : (hasMultipleTools ? "outline" : "success")}
                        onClick={() => handleQuickPick(item)}
                        disabled={isSubmitting === item.id}
                        className={cn("flex-1 gap-2 h-14", pendingPicks.has(item.id) && "bg-blue-600 hover:bg-blue-700")}
                      >
                        <Check className="h-6 w-6" />
                        <span className="text-lg">
                          {pendingPicks.has(item.id)
                            ? `Pick ${pendingPicks.get(item.id)?.qty ?? 0}`
                            : hasMultipleTools
                              ? `This Tool (${remaining})`
                              : `Pick All (${remaining})`}
                        </span>
                      </Button>
                      {item.qty_per_unit > 1 && (
                        <Button
                          size="touch-lg"
                          variant="outline"
                          onClick={() => openPartialPick(item)}
                          disabled={isSubmitting === item.id}
                          className="px-5 h-14"
                        >
                          <Plus className="h-6 w-6" />
                        </Button>
                      )}
                      {onReportIssue && (
                        <Button
                          size="touch-lg"
                          variant={itemHasIssue ? "destructive" : "outline"}
                          onClick={() => setIssueReportItem(item)}
                          disabled={isSubmitting === item.id}
                          className="px-5 h-14"
                        >
                          <AlertTriangle className="h-6 w-6" />
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : onBatchUpdateAllocations && (
            <div className="flex flex-col gap-2">
              <Button
                size="touch-lg"
                variant="outline"
                onClick={() => setDistributeItem(item)}
                className="w-full gap-2 h-14 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <Pencil className="h-6 w-6" />
                <span className="text-lg">Edit Picks</span>
              </Button>
            </div>
          )}

          {/* Remove Part button - mobile */}
          {onDeleteLineItem && (
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => {
                  const totalPicks = totalPicksMap.get(item.id);
                  if (totalPicks && totalPicks.totalPicked > 0) {
                    setOverPickWarning('Cannot remove part with existing picks. Undo all picks first.');
                    setTimeout(() => setOverPickWarning(null), 5000);
                    return;
                  }
                  setDeleteConfirmLineItem(item);
                }}
                disabled={isSubmitting === item.id}
                title="Remove part from order"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                <span className="text-xs">Remove</span>
              </Button>
            </div>
          )}

        </div>
      </div>
    );
  };

  // Combined render function for both desktop and mobile
  const renderLineItem = (item: LineItem) => (
    <div
      key={item.id}
      ref={(el) => {
        if (el) itemRefs.current.set(item.id, el);
        else itemRefs.current.delete(item.id);
      }}
    >
      {renderDesktopLineItem(item)}
      {renderMobileLineItem(item)}
    </div>
  );

  return (
    <div className="picking-interface relative pb-24 md:pb-0">
      {/* Header with Tool Info - Mobile */}
      <div className="bg-background border-b md:hidden -mx-4 px-4">
        <div className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Package className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="font-bold text-xl truncate">{tool.tool_number}</h2>
                <p className="text-sm text-muted-foreground truncate">{tool.serial_number ? `SN: ${tool.serial_number}` : 'Tool Pick'}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <div className="text-3xl font-bold text-primary tabular-nums">{completedItems}/{totalItems}</div>
              <p className="text-xs text-muted-foreground">Items picked</p>
            </div>
          </div>
          <div className="mt-2 h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%` }} />
          </div>
        </div>
        {/* Mobile Sort Controls */}
        <div className="flex items-center gap-2 pb-3 flex-wrap">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="flex-1 h-10 min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="part_number">Sort by Part Number</SelectItem>
              <SelectItem value="location">Sort by Location</SelectItem>
              <SelectItem value="assembly">Sort by Assembly</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0 px-2">
            <Checkbox
              checked={hideCompleted}
              onCheckedChange={(checked) => setHideCompleted(checked === true)}
            />
            <span className="text-sm whitespace-nowrap">
              {hideCompleted ? <EyeOff className="h-4 w-4 inline mr-1" /> : <Eye className="h-4 w-4 inline mr-1" />}
              Hide done
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0 px-2">
            <Checkbox
              checked={showOutOfStockOnly}
              onCheckedChange={(checked) => setShowOutOfStockOnly(checked === true)}
            />
            <span className="text-sm whitespace-nowrap">
              Out of stock
              {outOfStockCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {outOfStockCount}
                </Badge>
              )}
            </span>
          </label>
        </div>
        {hiddenCount > 0 && (
          <div className="text-xs text-muted-foreground pb-2">
            {hiddenCount} completed item{hiddenCount !== 1 ? 's' : ''} hidden
          </div>
        )}
      </div>

      {/* Desktop Sort Controls */}
      <div className="hidden md:flex items-center justify-end gap-4 mb-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={hideCompleted}
            onCheckedChange={(checked) => setHideCompleted(checked === true)}
          />
          <span className="text-sm font-medium">Hide completed items</span>
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {hiddenCount} hidden
            </Badge>
          )}
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={showOutOfStockOnly}
            onCheckedChange={(checked) => setShowOutOfStockOnly(checked === true)}
          />
          <span className="text-sm font-medium">Out of stock only</span>
          {outOfStockCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {outOfStockCount}
            </Badge>
          )}
        </label>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="part_number">Sort by Part Number</SelectItem>
              <SelectItem value="location">Sort by Location</SelectItem>
              <SelectItem value="assembly">Sort by Assembly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Over-Pick Warning Alert */}
      {overPickWarning && (
        <Alert variant="destructive" className="mb-4 relative">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Concurrent Pick Detected</AlertTitle>
          <AlertDescription>{overPickWarning}</AlertDescription>
          <button
            onClick={() => setOverPickWarning(null)}
            className="absolute top-2 right-2 p-1 hover:bg-destructive/20 rounded"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      {/* Desktop Table Header */}
      <div className={cn(
        "hidden md:grid gap-2 px-3 py-2 bg-muted rounded-t-lg text-sm font-medium",
        hasMultipleTools ? "grid-cols-12" : "grid-cols-12"
      )}>
        <div className="col-span-2">Part Number</div>
        <div className="col-span-3">Description</div>
        <div className="col-span-2">Location</div>
        <div className="col-span-1 text-center">Stock</div>
        <div className="col-span-2 text-center">{hasMultipleTools ? 'Total' : 'Qty'}</div>
        <div className="col-span-2 text-center">Actions</div>
      </div>

      {/* Line Items */}
      <div className="space-y-3 md:space-y-1 mt-3 md:mt-0">
        {sortMode === 'location' && locationGroups ? (
          Array.from(locationGroups.entries()).map(([prefix, items]) => {
            const unpickedCount = getUnpickedCountInLocation(items);
            const isPickingThisLocation = isPickingLocation === prefix;

            return (
              <div key={prefix} className="space-y-3 md:space-y-1">
                {/* Location Group Header */}
                <div className="flex items-center gap-2 px-4 py-3 md:px-3 md:py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl md:rounded-lg mt-4 md:mt-3 first:mt-0">
                  <MapPin className="h-5 w-5 md:h-4 md:w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-lg md:text-base text-blue-800 dark:text-blue-200">{prefix}</span>
                  <Badge variant="secondary" className="text-sm">{items.length} {items.length === 1 ? 'item' : 'items'}</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    {unpickedCount > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 bg-blue-600 hover:bg-blue-700"
                        onClick={() => handlePickAllInLocation(items)}
                        disabled={isPickingThisLocation}
                      >
                        {isPickingThisLocation ? (
                          <>Picking...</>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Pick All ({unpickedCount})
                          </>
                        )}
                      </Button>
                    )}
                    {unpickedCount === 0 && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                  </div>
                </div>
                {items.map(renderLineItem)}
              </div>
            );
          })
        ) : sortMode === 'assembly' && assemblyGroups ? (
          Array.from(assemblyGroups.entries()).map(([assemblyName, items]) => {
            const unpickedCount = getUnpickedCountInLocation(items);

            return (
              <div key={assemblyName} className="space-y-3 md:space-y-1">
                {/* Assembly Group Header */}
                <div className="flex items-center gap-2 px-4 py-3 md:px-3 md:py-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl md:rounded-lg mt-4 md:mt-3 first:mt-0">
                  <Package className="h-5 w-5 md:h-4 md:w-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-semibold text-lg md:text-base text-purple-800 dark:text-purple-200 font-mono">{assemblyName}</span>
                  <Badge variant="secondary" className="text-sm">{items.length} {items.length === 1 ? 'part' : 'parts'}</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    {unpickedCount === 0 && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                  </div>
                </div>
                {items.map(renderLineItem)}
              </div>
            );
          })
        ) : (
          sortedItems.map(renderLineItem)
        )}
      </div>

      {sortedItems.length === 0 && (
        <div className="py-16 md:py-8 text-center text-muted-foreground">
          <Package className="h-16 w-16 md:h-12 md:w-12 mx-auto mb-4 opacity-50" />
          <p className="text-xl md:text-base">No line items for this order</p>
        </div>
      )}

      {/* Mobile Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t p-4 md:hidden safe-area-bottom z-20">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Progress</div>
            <div className="font-semibold text-lg">{completedItems} of {totalItems} items</div>
          </div>
          {completedItems === totalItems && totalItems > 0 ? (
            <Badge variant="success" className="text-lg py-3 px-5">
              <CheckCircle2 className="h-6 w-6 mr-2" />
              All Picked!
            </Badge>
          ) : (
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Remaining</div>
              <div className="text-2xl font-bold text-primary tabular-nums">{totalItems - completedItems}</div>
            </div>
          )}
        </div>
      </div>

      {/* Set Pick Quantity Dialog */}
      <Dialog
        open={partialPickItem !== null}
        onOpenChange={(open) => !open && setPartialPickItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Pick Quantity</DialogTitle>
            <DialogDescription>
              Set the quantity, then click the checkmark button to confirm the pick.
            </DialogDescription>
          </DialogHeader>

          {partialPickItem && (
            <div className="space-y-4 py-4">
              <div>
                <p className="font-medium">{partialPickItem.part_number}</p>
                <p className="text-sm text-muted-foreground">
                  {partialPickItem.description}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="partialQty">Quantity to Pick</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setPartialQty(String(Math.max(1, parseInt(partialQty) - 1)))
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      id="partialQty"
                      type="number"
                      min="1"
                      max={
                        partialPickItem.qty_per_unit -
                        (toolPicks.get(partialPickItem.id) || 0)
                      }
                      value={partialQty}
                      onChange={(e) => setPartialQty(e.target.value)}
                      className="w-20 text-center"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setPartialQty(
                          String(
                            Math.min(
                              parseInt(partialQty) + 1,
                              partialPickItem.qty_per_unit -
                                (toolPicks.get(partialPickItem.id) || 0)
                            )
                          )
                        )
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold">
                    {partialPickItem.qty_per_unit -
                      (toolPicks.get(partialPickItem.id) || 0)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partialNote">
                  <MessageSquare className="inline h-4 w-4 mr-1" />
                  Note (optional)
                </Label>
                <Textarea
                  id="partialNote"
                  placeholder="Why is this a partial pick?"
                  value={partialNote}
                  onChange={(e) => setPartialNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialPickItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSetPendingPick}
              disabled={
                !partialQty ||
                parseInt(partialQty) <= 0
              }
            >
              Set Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Pick Confirmation Dialog */}
      <Dialog
        open={deleteConfirmPick !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmPick(null);
            setDeletePassword('');
            setDeletePasswordError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Pick Record</DialogTitle>
            <DialogDescription>
              Enter the password to delete this pick record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmPick && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge>{deleteConfirmPick.qty_picked}x picked</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">By:</span> {deleteConfirmPick.picked_by || 'Unknown'}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">At:</span> {formatDateTime(deleteConfirmPick.picked_at)}
                </div>
                {deleteConfirmPick.notes && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Note:</span> {deleteConfirmPick.notes}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deletePassword">Password</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  placeholder="Enter password to confirm"
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    setDeletePasswordError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDeletePick();
                    }
                  }}
                  autoFocus
                />
                {deletePasswordError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{deletePasswordError}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmPick(null);
                setDeletePassword('');
                setDeletePasswordError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePick}
              disabled={isDeleting || !deletePassword}
            >
              {isDeleting ? 'Deleting...' : 'Delete Pick'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Password Confirmation Dialog */}
      <Dialog
        open={undoPasswordItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUndoPasswordItem(null);
            setUndoPassword('');
            setUndoPasswordError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo All Picks</DialogTitle>
            <DialogDescription>
              Enter the password to undo all picks for this part. This will remove all pick records across all tools for this order.
            </DialogDescription>
          </DialogHeader>

          {undoPasswordItem && (
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="font-medium font-mono text-lg">{undoPasswordItem.part_number}</div>
                {undoPasswordItem.description && (
                  <div className="text-sm text-muted-foreground mt-1">{undoPasswordItem.description}</div>
                )}
                <div className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  <strong>Warning:</strong> This will undo {lineItemsWithPicks.find(li => li.id === undoPasswordItem.id)?.picks.length || 0} pick record(s) totaling {lineItemsWithPicks.find(li => li.id === undoPasswordItem.id)?.total_picked || 0} units.
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="undoPassword">Password</Label>
                <Input
                  id="undoPassword"
                  type="password"
                  placeholder="Enter password to confirm"
                  value={undoPassword}
                  onChange={(e) => {
                    setUndoPassword(e.target.value);
                    setUndoPasswordError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmUndo();
                    }
                  }}
                  autoFocus
                />
                {undoPasswordError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{undoPasswordError}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUndoPasswordItem(null);
                setUndoPassword('');
                setUndoPasswordError(null);
              }}
              disabled={isUndoing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmUndo}
              disabled={isUndoing || !undoPassword}
            >
              {isUndoing ? 'Undoing...' : 'Undo All Picks'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Issue Dialog */}
      <ReportIssueDialog
        open={issueReportItem !== null}
        onOpenChange={(open) => !open && setIssueReportItem(null)}
        lineItem={issueReportItem}
        onSubmit={handleReportIssue}
      />

      {/* Distribute Inventory Dialog */}
      <DistributeInventoryDialog
        open={distributeItem !== null}
        onOpenChange={(open) => !open && setDistributeItem(null)}
        lineItem={distributeItem}
        tools={distributeItem?.tool_ids && distributeItem.tool_ids.length > 0
          ? allTools.filter(t => distributeItem.tool_ids!.includes(t.id))
          : allTools}
        currentAllocations={distributeItem ? getCurrentAllocations(distributeItem) : new Map()}
        availableStock={distributeItem?.qty_available ?? 0}
        onSave={handleDistributeSave}
      />

      {/* Remove Part Confirmation Dialog */}
      <Dialog
        open={deleteConfirmLineItem !== null}
        onOpenChange={(open) => !open && setDeleteConfirmLineItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Part from Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{deleteConfirmLineItem?.part_number}</strong> from this order? This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmLineItem && (
            <div className="py-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="font-medium font-mono">{deleteConfirmLineItem.part_number}</div>
                {deleteConfirmLineItem.description && (
                  <div className="text-sm text-muted-foreground">{deleteConfirmLineItem.description}</div>
                )}
                {deleteConfirmLineItem.location && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Location:</span> {deleteConfirmLineItem.location}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Qty needed:</span> {deleteConfirmLineItem.total_qty_needed}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmLineItem(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteConfirmLineItem || !onDeleteLineItem) return;
                setIsDeleting(true);
                const success = await onDeleteLineItem(deleteConfirmLineItem.id);
                setIsDeleting(false);
                if (success) {
                  setDeleteConfirmLineItem(null);
                }
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Tag Dialog */}
      <PrintTagDialog
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
        tagData={printTagData}
      />
    </div>
  );
}
