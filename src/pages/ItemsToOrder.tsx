import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ChevronDown, ChevronRight, MapPin, X, Download, AlertCircle, CheckCircle2, Truck, Filter, Package, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SearchInput } from '@/components/common/SearchInput';
import { useItemsToOrder } from '@/hooks/useItemsToOrder';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { exportItemsToOrderToExcel } from '@/lib/excelExport';
import { alphanumericCompare } from '@/lib/utils';
import { EmptyState } from '@/components/common/EmptyState';
import {
  UnifiedFilterBar,
  type SortOption,
} from '@/components/filters';

type SortMode = 'part_number' | 'remaining' | 'location';

const ITEMS_TO_ORDER_SORT_KEY = 'items-to-order-sort-preference';

const SORT_OPTIONS: SortOption<SortMode>[] = [
  { value: 'remaining', label: 'Sort by Qty Needed (High to Low)' },
  { value: 'part_number', label: 'Sort by Part Number' },
  { value: 'location', label: 'Sort by Location' },
];

export function ItemsToOrder() {
  const { items, onOrderItems, loading } = useItemsToOrder();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(ITEMS_TO_ORDER_SORT_KEY);
    return (saved as SortMode) || 'remaining';
  });
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [selectedAssemblies, setSelectedAssemblies] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'need-to-order' | 'on-order'>('need-to-order');

  // Persist sort preference
  useEffect(() => {
    localStorage.setItem(ITEMS_TO_ORDER_SORT_KEY, sortMode);
  }, [sortMode]);

  // Current data source based on active tab
  const currentItems = activeTab === 'need-to-order' ? items : onOrderItems;

  // Compute unique orders for filter dropdown
  const orderOptions = useMemo(() => {
    const ordersMap = new Map<string, string>(); // order_id -> so_number
    currentItems.forEach(item => {
      item.orders.forEach(o => ordersMap.set(o.order_id, o.so_number));
    });
    return Array.from(ordersMap.entries())
      .map(([id, so_number]) => ({ value: id, label: `SO-${so_number}` }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [currentItems]);

  // Compute unique locations for filter dropdown
  const locationOptions = useMemo(() => {
    const locs = new Set<string>();
    currentItems.forEach(item => {
      if (item.location) locs.add(item.location);
    });
    return Array.from(locs)
      .sort((a, b) => alphanumericCompare(a, b))
      .map(loc => ({ value: loc, label: loc }));
  }, [currentItems]);

  // Compute unique assemblies for filter dropdown
  const assemblyOptions = useMemo(() => {
    const models = new Set<string>();
    currentItems.forEach(item => {
      item.orders.forEach(o => {
        if (o.tool_model) models.add(o.tool_model);
      });
    });
    return Array.from(models)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(model => ({ value: model, label: model }));
  }, [currentItems]);

  const hasActiveFilters = selectedOrders.size > 0 || selectedLocations.size > 0 || selectedAssemblies.size > 0;

  const clearFilters = () => {
    setSelectedOrders(new Set());
    setSelectedLocations(new Set());
    setSelectedAssemblies(new Set());
  };

  const filteredItems = currentItems.filter((item) => {
    const matchesSearch =
      item.part_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      item.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      item.location?.toLowerCase().includes(debouncedSearch.toLowerCase());

    const matchesOrder = selectedOrders.size === 0
      || item.orders.some(o => selectedOrders.has(o.order_id));

    const matchesLocation = selectedLocations.size === 0
      || (item.location && selectedLocations.has(item.location));

    const matchesAssembly = selectedAssemblies.size === 0
      || item.orders.some(o => !!o.tool_model && selectedAssemblies.has(o.tool_model));

    return matchesSearch && matchesOrder && matchesLocation && matchesAssembly;
  });

  // Sort filtered items
  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];

    switch (sortMode) {
      case 'remaining':
        // Sort by remaining quantity (highest first)
        sorted.sort((a, b) => {
          const cmp = b.remaining - a.remaining;
          if (cmp !== 0) return cmp;
          return alphanumericCompare(a.part_number, b.part_number);
        });
        break;
      case 'location':
        // Sort by location, items without location go to end
        sorted.sort((a, b) => {
          const locA = a.location || '';
          const locB = b.location || '';
          if (!locA && locB) return 1;
          if (locA && !locB) return -1;
          if (!locA && !locB) return alphanumericCompare(a.part_number, b.part_number);
          const cmp = alphanumericCompare(locA, locB);
          if (cmp !== 0) return cmp;
          return alphanumericCompare(a.part_number, b.part_number);
        });
        break;
      case 'part_number':
      default:
        sorted.sort((a, b) => alphanumericCompare(a.part_number, b.part_number));
        break;
    }

    return sorted;
  }, [filteredItems, sortMode]);

  const toggleExpanded = (partNumber: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(partNumber)) {
      newExpanded.delete(partNumber);
    } else {
      newExpanded.add(partNumber);
    }
    setExpandedItems(newExpanded);
  };

  // Stats - based on filtered items so counts match what's shown
  const totalItems = filteredItems.length;
  const totalQtyToOrder = filteredItems.reduce((sum, p) => sum + p.qty_to_order, 0);
  const totalOrders = new Set(filteredItems.flatMap(item => item.orders.map(o => o.order_id))).size;
  const totalOnOrderQty = filteredItems.reduce((sum, p) => sum + (p.qty_on_order ?? 0), 0);

  const handleExport = () => {
    exportItemsToOrderToExcel(items);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Items to Order</h1>
          <p className="text-muted-foreground">
            Parts with insufficient stock to complete active orders
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'need-to-order' | 'on-order')}>
        <TabsList>
          <TabsTrigger value="need-to-order" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Need to Order
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-1">{items.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="on-order" className="gap-2">
            <Truck className="h-4 w-4" />
            On Order
            {onOrderItems.length > 0 && (
              <Badge variant="secondary" className="ml-1">{onOrderItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 mt-4">
          {activeTab === 'need-to-order' ? (
            <>
              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2">
                      <ShoppingCart className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalItems}</div>
                      <p className="text-sm text-muted-foreground">Unique Parts to Order</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2">
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalQtyToOrder}</div>
                      <p className="text-sm text-muted-foreground">Total Qty to Order</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{totalOrders}</div>
                  <p className="text-sm text-muted-foreground">Orders Affected</p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                      <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalItems}</div>
                      <p className="text-sm text-muted-foreground">Unique Parts On Order</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                      <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{totalOnOrderQty}</div>
                      <p className="text-sm text-muted-foreground">Total Qty On Order</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{totalOrders}</div>
                  <p className="text-sm text-muted-foreground">Orders Affected</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Search and Filters */}
        <UnifiedFilterBar
          variant="warning"
          className="mt-4"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by part number, description, or location..."
          searchLarge
          sort={{
            options: SORT_OPTIONS,
            value: sortMode,
            onChange: setSortMode,
            width: 'w-52',
          }}
          dropdowns={[
            {
              label: 'Order',
              icon: Filter,
              options: orderOptions,
              selected: selectedOrders,
              onChange: setSelectedOrders,
              allLabel: 'All Orders',
            },
            {
              label: 'Location',
              icon: MapPin,
              options: locationOptions,
              selected: selectedLocations,
              onChange: setSelectedLocations,
              allLabel: 'All Locations',
            },
            {
              label: 'Assembly',
              icon: Wrench,
              options: assemblyOptions,
              selected: selectedAssemblies,
              onChange: setSelectedAssemblies,
              allLabel: 'All Assemblies',
            },
          ]}
          showClearAll={hasActiveFilters}
          onClearAll={clearFilters}
          resultCount={(debouncedSearch || hasActiveFilters) ? filteredItems.length : undefined}
        />

        {/* Need to Order Tab Content */}
        <TabsContent value="need-to-order">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Loading items...</p>
              </CardContent>
            </Card>
          ) : sortedItems.length === 0 ? (
            <EmptyState
              icon={debouncedSearch || hasActiveFilters ? ShoppingCart : CheckCircle2}
              message={
                debouncedSearch || hasActiveFilters
                  ? 'No items match your search or filters'
                  : 'No items need to be ordered. All parts have stock available!'
              }
              actions={hasActiveFilters ? [{ label: 'Clear filters', onClick: clearFilters, variant: 'link' }] : undefined}
            />
          ) : (
            <div className="space-y-2">
              {sortedItems.map((item) => {
                const isExpanded = expandedItems.has(item.part_number);

                return (
                  <Card
                    key={item.part_number}
                    className="border-l-4 border-l-orange-400"
                  >
                    <CardContent className="pt-4">
                      {/* Main Row */}
                      <div
                        className="flex items-center gap-4 cursor-pointer"
                        onClick={() => toggleExpanded(item.part_number)}
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
                              {item.part_number}
                            </span>
                            {item.location && (
                              <Badge variant="outline" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.location}
                              </Badge>
                            )}
                            {item.qty_available === 0 ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Out of Stock
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">
                                <AlertCircle className="h-3 w-3" />
                                Low Stock ({item.qty_available} avail)
                              </Badge>
                            )}
                            {item.qty_on_order !== null && item.qty_on_order > 0 && (
                              <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                                <Truck className="h-3 w-3" />
                                {item.qty_on_order} on order
                              </Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
                              {item.qty_to_order}
                            </span>
                            <span className="text-muted-foreground">to order</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.remaining} needed across {item.orders.length} order{item.orders.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Expanded: Per-Order Breakdown */}
                      {isExpanded && (
                        <div className="mt-4 ml-12 border-t pt-4">
                          <p className="text-sm font-medium mb-2">
                            Orders needing this part:
                          </p>
                          <div className="space-y-2">
                            {item.orders.map((orderInfo) => {
                              const orderRemaining = orderInfo.needed - orderInfo.picked;
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
                                    <span className="font-mono">
                                      {orderInfo.picked} / {orderInfo.needed}
                                    </span>
                                    <Badge variant="outline" className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                                      {orderRemaining} needed
                                    </Badge>
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
              })}
            </div>
          )}
        </TabsContent>

        {/* On Order Tab Content */}
        <TabsContent value="on-order">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Loading items...</p>
              </CardContent>
            </Card>
          ) : sortedItems.length === 0 ? (
            <EmptyState
              icon={debouncedSearch || hasActiveFilters ? Truck : CheckCircle2}
              message={
                debouncedSearch || hasActiveFilters
                  ? 'No items match your search or filters'
                  : 'No items are currently on order.'
              }
              actions={hasActiveFilters ? [{ label: 'Clear filters', onClick: clearFilters, variant: 'link' }] : undefined}
            />
          ) : (
            <div className="space-y-2">
              {sortedItems.map((item) => {
                const isExpanded = expandedItems.has(item.part_number);

                return (
                  <Card
                    key={item.part_number}
                    className="border-l-4 border-l-blue-400"
                  >
                    <CardContent className="pt-4">
                      {/* Main Row */}
                      <div
                        className="flex items-center gap-4 cursor-pointer"
                        onClick={() => toggleExpanded(item.part_number)}
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
                              {item.part_number}
                            </span>
                            {item.location && (
                              <Badge variant="outline" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.location}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                              <Truck className="h-3 w-3" />
                              {item.qty_on_order} on order
                            </Badge>
                            {item.qty_to_order > 0 && (
                              <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Still need {item.qty_to_order} more
                              </Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                              {item.qty_on_order}
                            </span>
                            <span className="text-muted-foreground">on order</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.remaining} needed across {item.orders.length} order{item.orders.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Expanded: Per-Order Breakdown */}
                      {isExpanded && (
                        <div className="mt-4 ml-12 border-t pt-4">
                          <p className="text-sm font-medium mb-2">
                            Orders needing this part:
                          </p>
                          <div className="space-y-2">
                            {item.orders.map((orderInfo) => {
                              const orderRemaining = orderInfo.needed - orderInfo.picked;
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
                                    <span className="font-mono">
                                      {orderInfo.picked} / {orderInfo.needed}
                                    </span>
                                    <Badge variant="outline" className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                                      {orderRemaining} remaining
                                    </Badge>
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
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
