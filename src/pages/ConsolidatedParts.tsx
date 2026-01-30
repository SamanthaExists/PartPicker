import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronDown, ChevronRight, MapPin, ArrowUpDown, X, Download, ClipboardList, CheckCircle2, Clock, Layers, List, Copy, FileSpreadsheet, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/common/SearchInput';
import { OrderFilterPopover } from '@/components/common/OrderFilterPopover';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useConsolidatedParts, type OrderStatusFilter } from '@/hooks/useConsolidatedParts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn, getLocationPrefix, alphanumericCompare } from '@/lib/utils';
import { exportConsolidatedPartsToExcel, exportPartNumbersToExcel } from '@/lib/excelExport';
import { MultiOrderPickDialog } from '@/components/picking/MultiOrderPickDialog';
import type { ConsolidatedPart } from '@/types';

type SortMode = 'part_number' | 'location';

// Shared PartCard component to avoid code duplication
interface PartCardProps {
  part: ConsolidatedPart;
  isExpanded: boolean;
  onToggleExpand: (partNumber: string) => void;
  onPickClick: (part: ConsolidatedPart, e: React.MouseEvent) => void;
}

function PartCard({ part, isExpanded, onToggleExpand, onPickClick }: PartCardProps) {
  const isComplete = part.remaining === 0;
  const progressPercent =
    part.total_needed > 0
      ? Math.round((part.total_picked / part.total_needed) * 100)
      : 0;

  return (
    <Card className={cn(isComplete && 'bg-green-50 border-green-200')}>
      <CardContent className="pt-4 pb-4">
        {/* Mobile Layout */}
        <div
          className="flex flex-col gap-3 cursor-pointer sm:hidden"
          onClick={() => onToggleExpand(part.part_number)}
        >
          {/* Row 1: Part number and expand icon */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold text-base">
                  {part.part_number}
                </span>
                {isComplete && <Badge variant="success" className="text-xs">Complete</Badge>}
              </div>
              {part.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {part.description}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Row 2: Location */}
          {part.location && (
            <Badge variant="outline" className="gap-1 w-fit">
              <MapPin className="h-3 w-3" />
              {part.location}
            </Badge>
          )}

          {/* Row 3: Qty Available and On Order */}
          <div className="flex gap-4 text-sm">
            {part.qty_available !== null && (
              <div>
                <span className="text-muted-foreground">Available: </span>
                <span className={cn(
                  "font-semibold",
                  part.qty_available >= part.remaining ? "text-green-600" : "text-amber-600"
                )}>
                  {part.qty_available}
                </span>
              </div>
            )}
            {part.qty_on_order !== null && part.qty_on_order > 0 && (
              <div className="flex items-center gap-1">
                <Truck className="h-3 w-3 text-blue-500" />
                <span className="text-muted-foreground">On Order: </span>
                <span className="font-semibold text-blue-600">{part.qty_on_order}</span>
              </div>
            )}
          </div>

          {/* Row 4: Progress and quantities */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Progress value={progressPercent} className="h-2" />
            </div>
            <div className="text-right shrink-0">
              <span className="font-bold">{part.total_picked}</span>
              <span className="text-muted-foreground"> / {part.total_needed}</span>
              <span className="text-xs text-muted-foreground ml-2">({part.remaining} left)</span>
            </div>
          </div>

          {/* Row 4: Pick button */}
          {!isComplete && (
            <Button
              size="sm"
              variant="default"
              className="w-full"
              onClick={(e) => onPickClick(part, e)}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Pick Parts
            </Button>
          )}
        </div>

        {/* Desktop Layout */}
        <div
          className="hidden sm:flex items-center gap-4 cursor-pointer"
          onClick={() => onToggleExpand(part.part_number)}
        >
          <Button variant="ghost" size="icon" className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-lg">
                {part.part_number}
              </span>
              {part.location && (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" />
                  {part.location}
                </Badge>
              )}
              {isComplete && <Badge variant="success">Complete</Badge>}
            </div>
            {part.description && (
              <p className="text-sm text-muted-foreground truncate">
                {part.description}
              </p>
            )}
          </div>

          {/* Qty Available */}
          {part.qty_available !== null && (
            <div className="text-center shrink-0 min-w-[70px]">
              <div className={cn(
                "text-lg font-bold",
                part.qty_available >= part.remaining ? "text-green-600" : "text-amber-600"
              )}>
                {part.qty_available}
              </div>
              <p className="text-xs text-muted-foreground">available</p>
            </div>
          )}

          {/* Qty On Order */}
          {part.qty_on_order !== null && part.qty_on_order > 0 && (
            <div className="text-center shrink-0 min-w-[70px]">
              <div className="text-lg font-bold text-blue-600 flex items-center justify-center gap-1">
                <Truck className="h-4 w-4" />
                {part.qty_on_order}
              </div>
              <p className="text-xs text-muted-foreground">on order</p>
            </div>
          )}

          <div className="text-right shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">
                {part.total_picked}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-lg">{part.total_needed}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {part.remaining} remaining
            </p>
          </div>

          <div className="w-24 shrink-0">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-center mt-1">{progressPercent}%</p>
          </div>

          {/* Pick Button */}
          {!isComplete && (
            <Button
              size="sm"
              variant="default"
              className="shrink-0"
              onClick={(e) => onPickClick(part, e)}
            >
              <ClipboardList className="h-4 w-4 mr-1" />
              Pick
            </Button>
          )}
        </div>

        {/* Expanded: Per-Order Breakdown */}
        {isExpanded && (
          <div className="mt-4 ml-12 border-t pt-4">
            <p className="text-sm font-medium mb-2">
              Orders using this part:
            </p>
            <div className="space-y-2">
              {part.orders.map((orderInfo) => {
                const orderComplete = orderInfo.picked >= orderInfo.needed;
                return (
                  <div
                    key={orderInfo.order_id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <Link
                      to={`/orders/${orderInfo.order_id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      SO-{orderInfo.so_number}
                    </Link>
                    <div className="flex items-center gap-4">
                      <span
                        className={cn(
                          'font-mono',
                          orderComplete && 'text-green-600'
                        )}
                      >
                        {orderInfo.picked} / {orderInfo.needed}
                      </span>
                      {orderComplete ? (
                        <Badge variant="success">Done</Badge>
                      ) : (
                        <Badge variant="outline">
                          {orderInfo.needed - orderInfo.picked} left
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CONSOLIDATED_SORT_PREFERENCE_KEY = 'consolidated-parts-sort-preference';
const CONSOLIDATED_STATUS_FILTER_KEY = 'consolidated-parts-status-filter';

export function ConsolidatedParts() {
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>(() => {
    const saved = localStorage.getItem(CONSOLIDATED_STATUS_FILTER_KEY);
    return (saved as OrderStatusFilter) || 'all';
  });
  const { parts, loading } = useConsolidatedParts(statusFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(CONSOLIDATED_SORT_PREFERENCE_KEY);
    return (saved as SortMode) || 'part_number';
  });
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Persist status filter preference
  useEffect(() => {
    localStorage.setItem(CONSOLIDATED_STATUS_FILTER_KEY, statusFilter);
  }, [statusFilter]);

  // Multi-order pick dialog state
  const [selectedPart, setSelectedPart] = useState<ConsolidatedPart | null>(null);
  const [pickDialogOpen, setPickDialogOpen] = useState(false);

  const handlePickClick = (part: ConsolidatedPart, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPart(part);
    setPickDialogOpen(true);
  };

  // Persist sort preference
  useEffect(() => {
    localStorage.setItem(CONSOLIDATED_SORT_PREFERENCE_KEY, sortMode);
  }, [sortMode]);

  // Compute unique orders for filter dropdown
  const uniqueOrders = useMemo(() => {
    const ordersMap = new Map<string, string>(); // order_id -> so_number
    parts.forEach(part => {
      part.orders.forEach(o => ordersMap.set(o.order_id, o.so_number));
    });
    return Array.from(ordersMap.entries())
      .map(([id, so_number]) => ({ id, so_number }))
      .sort((a, b) => a.so_number.localeCompare(b.so_number, undefined, { numeric: true }));
  }, [parts]);

  const hasActiveFilters = selectedOrders.size > 0;

  const clearFilters = () => {
    setSelectedOrders(new Set());
  };

  const toggleOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const selectAllOrders = () => {
    setSelectedOrders(new Set(uniqueOrders.map(o => o.id)));
  };

  const deselectAllOrders = () => {
    setSelectedOrders(new Set());
  };

  const filteredParts = parts.filter((part) => {
    const matchesSearch =
      part.part_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      part.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      part.location?.toLowerCase().includes(debouncedSearch.toLowerCase());

    const matchesCompleted = showCompleted || part.remaining > 0;

    const matchesOrder = selectedOrders.size === 0
      || part.orders.some(o => selectedOrders.has(o.order_id));

    return matchesSearch && matchesCompleted && matchesOrder;
  });

  // Sort and group filtered parts
  const { sortedParts, locationGroups } = useMemo(() => {
    const items = [...filteredParts];

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
      const groups = new Map<string, typeof filteredParts>();
      items.forEach(part => {
        const prefix = getLocationPrefix(part.location) || 'No Location';
        if (!groups.has(prefix)) {
          groups.set(prefix, []);
        }
        const group = groups.get(prefix);
        if (group) {
          group.push(part);
        }
      });

      return { sortedParts: items, locationGroups: groups };
    } else {
      // Sort by part number (alphanumeric)
      items.sort((a, b) => alphanumericCompare(a.part_number, b.part_number));
      return { sortedParts: items, locationGroups: null };
    }
  }, [filteredParts, sortMode]);

  const toggleExpanded = (partNumber: string) => {
    const newExpanded = new Set(expandedParts);
    if (newExpanded.has(partNumber)) {
      newExpanded.delete(partNumber);
    } else {
      newExpanded.add(partNumber);
    }
    setExpandedParts(newExpanded);
  };

  // Stats
  const totalParts = parts.length;
  const completeParts = parts.filter((p) => p.remaining === 0).length;
  const totalNeeded = parts.reduce((sum, p) => sum + p.total_needed, 0);
  const totalPicked = parts.reduce((sum, p) => sum + p.total_picked, 0);

  const handleExport = () => {
    exportConsolidatedPartsToExcel(parts);
  };

  // Copy part numbers feedback
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopyPartNumbers = async () => {
    const partNumbers = parts.map(p => p.part_number).join('\n');
    try {
      await navigator.clipboard.writeText(partNumbers);
      setCopyFeedback(`${parts.length} part numbers copied`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const handleExportPartNumbers = () => {
    const partNumbers = parts.map(p => p.part_number);
    exportPartNumbersToExcel(partNumbers);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Consolidated Parts</h1>
          <p className="text-muted-foreground">
            View all parts across active orders, grouped by part number
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyPartNumbers} disabled={parts.length === 0}>
            <Copy className="mr-2 h-4 w-4" />
            {copyFeedback || 'Copy Part #s'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPartNumbers} disabled={parts.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export Part #s
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={parts.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export Full
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalParts}</div>
            <p className="text-sm text-muted-foreground">Unique Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalNeeded}</div>
            <p className="text-sm text-muted-foreground">Total Qty Needed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{totalPicked}</div>
            <p className="text-sm text-muted-foreground">Total Qty Picked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {completeParts}/{totalParts}
            </div>
            <p className="text-sm text-muted-foreground">Parts Complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Search Section */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Prominent Search Bar */}
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by part number, description, or location..."
              large
            />
            {/* Filter Options Row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Order Status Filter Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground mr-1">Orders:</span>
                {[
                  { key: 'all' as const, label: 'All', shortLabel: 'All', icon: List, title: 'Show parts from all orders' },
                  { key: 'active' as const, label: 'Active', shortLabel: 'Active', icon: Clock, title: 'Show parts from active orders only' },
                  { key: 'complete' as const, label: 'Complete', shortLabel: 'Done', icon: CheckCircle2, title: 'Show parts from completed orders only' },
                ].map(({ key, label, shortLabel, icon: Icon, title }) => (
                  <Button
                    key={key}
                    variant={statusFilter === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(key)}
                    className="flex items-center gap-1.5"
                    title={title}
                    aria-label={title}
                    aria-pressed={statusFilter === key}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{shortLabel}</span>
                  </Button>
                ))}
              </div>

              {/* Sort and filter dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="part_number">Sort by Part Number</SelectItem>
                    <SelectItem value="location">Sort by Location</SelectItem>
                  </SelectContent>
                </Select>

                <OrderFilterPopover
                  orders={uniqueOrders}
                  selectedOrders={selectedOrders}
                  onToggleOrder={toggleOrder}
                  onSelectAll={selectAllOrders}
                  onDeselectAll={deselectAllOrders}
                />

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 px-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Additional Filters Row */}
            <div className="flex items-center gap-4 justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={showCompleted}
                  onCheckedChange={(checked) => setShowCompleted(checked === true)}
                />
                <span className="text-sm font-medium">Show completed parts</span>
              </label>
              {(debouncedSearch || hasActiveFilters) && (
                <span className="text-sm text-muted-foreground">
                  {filteredParts.length} result{filteredParts.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parts List */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading parts...</p>
          </CardContent>
        </Card>
      ) : sortedParts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {debouncedSearch || !showCompleted || hasActiveFilters
                ? 'No parts match your filters'
                : statusFilter === 'active'
                  ? 'No active orders with parts. Try switching to "All" orders.'
                  : statusFilter === 'complete'
                    ? 'No completed orders with parts.'
                    : 'No parts found. Import orders to see consolidated parts.'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="link"
                onClick={clearFilters}
                className="mt-2"
              >
                Clear filters
              </Button>
            )}
            {parts.length === 0 && !debouncedSearch && showCompleted && statusFilter !== 'all' && !hasActiveFilters && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setStatusFilter('all')}
              >
                Show All Orders
              </Button>
            )}
          </CardContent>
        </Card>
      ) : sortMode === 'location' && locationGroups ? (
        // Render with location group headers
        <div className="space-y-4">
          {Array.from(locationGroups.entries()).map(([prefix, groupParts]) => (
            <div key={prefix} className="space-y-2">
              {/* Location Group Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-lg text-blue-800">{prefix}</span>
                <Badge variant="secondary" className="ml-auto">
                  {groupParts.length} {groupParts.length === 1 ? 'part' : 'parts'}
                </Badge>
              </div>
              {/* Parts in this group */}
              {groupParts.map((part) => (
                <PartCard
                  key={part.part_number}
                  part={part}
                  isExpanded={expandedParts.has(part.part_number)}
                  onToggleExpand={toggleExpanded}
                  onPickClick={handlePickClick}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        // Render flat list sorted by part number
        <div className="space-y-2">
          {sortedParts.map((part) => (
            <PartCard
              key={part.part_number}
              part={part}
              isExpanded={expandedParts.has(part.part_number)}
              onToggleExpand={toggleExpanded}
              onPickClick={handlePickClick}
            />
          ))}
        </div>
      )}

      {/* Multi-Order Pick Dialog */}
      <MultiOrderPickDialog
        open={pickDialogOpen}
        onOpenChange={setPickDialogOpen}
        part={selectedPart}
      />
    </div>
  );
}
