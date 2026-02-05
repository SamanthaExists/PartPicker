import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Upload, Trash2, AlertCircle, Clock, CheckCircle2, Ban, Download, List, Wrench, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useOrders } from '@/hooks/useOrders';
import { formatDate, getStatusColor, getDueDateStatus, getDueDateColors, cn } from '@/lib/utils';
import { exportOrdersSummaryToExcel } from '@/lib/excelExport';
import { parseISO } from 'date-fns';
import {
  UnifiedFilterBar,
  type StatusButtonOption,
  type SortOption,
} from '@/components/filters';

type OrderSortOption = 'created' | 'due-date' | 'so-number';

const STATUS_OPTIONS: StatusButtonOption<string>[] = [
  { value: 'all', label: 'All', shortLabel: 'All', icon: List, title: 'Show all orders' },
  { value: 'active', label: 'Active', shortLabel: 'Active', icon: Clock, title: 'Show orders in progress' },
  { value: 'complete', label: 'Complete', shortLabel: 'Done', icon: CheckCircle2, title: 'Show completed orders' },
  { value: 'cancelled', label: 'Cancelled', shortLabel: 'Canc.', icon: Ban, title: 'Show cancelled orders' },
];

const SORT_OPTIONS: SortOption<OrderSortOption>[] = [
  { value: 'due-date', label: 'Due Date' },
  { value: 'created', label: 'Created' },
  { value: 'so-number', label: 'SO#' },
];

export function Orders() {
  const { orders, loading, createOrder, deleteOrder } = useOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<OrderSortOption>('due-date');
  const [selectedAssemblies, setSelectedAssemblies] = useState<Set<string>>(new Set());
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; soNumber: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [newOrder, setNewOrder] = useState({
    so_number: '',
    po_number: '',
    customer_name: '',
    tool_model: '',
    quantity: '1',
    order_date: '',
    due_date: '',
    estimated_ship_date: '',
    notes: '',
  });

  const filteredAndSortedOrders = useMemo(() => {
    // First filter
    const filtered = orders.filter((order) => {
      const matchesSearch =
        order.so_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter;

      // Hide completed filter (when enabled, hides completed orders in 'all' view)
      const matchesHideCompleted =
        !hideCompleted || order.status !== 'complete';

      const matchesAssembly = selectedAssemblies.size === 0 ||
        (!!order.tool_model && selectedAssemblies.has(order.tool_model));

      return matchesSearch && matchesStatus && matchesHideCompleted && matchesAssembly;
    });

    // Then sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'due-date':
          // Orders with no due date go to the end
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
        case 'so-number':
          return a.so_number.localeCompare(b.so_number, undefined, { numeric: true });
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [orders, searchQuery, statusFilter, hideCompleted, sortBy, selectedAssemblies]);

  const handleCreateOrder = async () => {
    if (!newOrder.so_number.trim()) return;

    await createOrder({
      so_number: newOrder.so_number.trim(),
      po_number: newOrder.po_number.trim() || null,
      customer_name: newOrder.customer_name.trim() || null,
      tool_model: newOrder.tool_model.trim() || null,
      quantity: parseInt(newOrder.quantity) || 1,
      order_date: newOrder.order_date || null,
      due_date: newOrder.due_date || null,
      estimated_ship_date: newOrder.estimated_ship_date || null,
      notes: newOrder.notes.trim() || null,
    });

    setNewOrder({
      so_number: '',
      po_number: '',
      customer_name: '',
      tool_model: '',
      quantity: '1',
      order_date: '',
      due_date: '',
      estimated_ship_date: '',
      notes: '',
    });
    setShowNewOrderDialog(false);
  };

  const handleDeleteOrder = (id: string, soNumber: string) => {
    setDeleteTarget({ id, soNumber });
    setDeleteConfirmText('');
  };

  const confirmDeleteOrder = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await deleteOrder(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const CONFIRM_PHRASE = 'confirm delete';

  const handleExportOrders = () => {
    exportOrdersSummaryToExcel(orders);
  };

  const assemblyOptions = useMemo(() => {
    const models = new Set<string>();
    orders.forEach(o => {
      if (o.tool_model) models.add(o.tool_model);
    });
    return Array.from(models)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(model => ({ value: model, label: model }));
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">
            Manage your sales orders and track picking progress
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportOrders}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" asChild>
            <Link to="/import">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Link>
          </Button>
          <Button onClick={() => setShowNewOrderDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <UnifiedFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by SO#, PO#, or customer..."
        statusButtons={STATUS_OPTIONS}
        statusValue={statusFilter}
        onStatusChange={setStatusFilter}
        sort={{
          options: SORT_OPTIONS,
          value: sortBy,
          onChange: setSortBy,
        }}
        dropdowns={[
          {
            label: 'Assembly',
            icon: Wrench,
            options: assemblyOptions,
            selected: selectedAssemblies,
            onChange: setSelectedAssemblies,
            allLabel: 'All Assemblies',
          },
        ]}
        toggles={statusFilter === 'all' ? [
          {
            label: 'Hide completed',
            checked: hideCompleted,
            onChange: setHideCompleted,
          },
        ] : undefined}
        showClearAll={selectedAssemblies.size > 0}
        onClearAll={() => setSelectedAssemblies(new Set())}
        resultCount={filteredAndSortedOrders.length}
      />

      {/* Orders List */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading orders...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedOrders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all'
                ? 'No orders match your filters'
                : 'No orders yet. Import or create one to get started.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild>
                  <Link to="/import">Import Order</Link>
                </Button>
                <Button variant="outline" onClick={() => setShowNewOrderDialog(true)}>
                  Create Manually
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAndSortedOrders.map((order) => {
            const dueDateInfo = getDueDateStatus(order.due_date);
            const dueDateColors = getDueDateColors(dueDateInfo.status);
            const isComplete = order.status === 'complete';
            const isCancelled = order.status === 'cancelled';

            return (
              <Card
                key={order.id}
                className={cn(
                  "hover:shadow-md transition-shadow",
                  // Completed orders - green left border and slightly faded
                  isComplete && "border-l-4 border-l-green-500 opacity-75",
                  // Cancelled orders - gray left border and more faded
                  isCancelled && "border-l-4 border-l-gray-400 opacity-60",
                  // Due date warnings - only for active orders
                  !isComplete && !isCancelled && dueDateInfo.status === 'overdue' && "border-l-4 border-l-red-500",
                  !isComplete && !isCancelled && dueDateInfo.status === 'due-soon' && "border-l-4 border-l-amber-500",
                )}
              >
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link
                          to={`/orders/${order.id}`}
                          className="text-lg font-semibold hover:underline"
                        >
                          SO-{order.so_number}
                        </Link>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                        {/* Due date badge - only show for active orders */}
                        {!isComplete && !isCancelled && dueDateInfo.status !== 'no-date' && (
                          <Badge
                            variant="outline"
                            className={cn("flex items-center gap-1", dueDateColors.badge)}
                          >
                            {dueDateInfo.status === 'overdue' ? (
                              <AlertCircle className="h-3 w-3" />
                            ) : dueDateInfo.status === 'due-soon' ? (
                              <Clock className="h-3 w-3" />
                            ) : null}
                            {dueDateInfo.label}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                        {order.tool_model && <span className="font-medium">{order.tool_model}</span>}
                        {order.customer_name && <span>{order.customer_name}</span>}
                        {order.po_number && <span>PO: {order.po_number}</span>}
                        {order.due_date && (
                          <span className={cn(!isComplete && !isCancelled && dueDateColors.text)}>
                            Due: {formatDate(order.due_date)}
                          </span>
                        )}
                        {order.estimated_ship_date && (
                          <span>Ship: {formatDate(order.estimated_ship_date)}</span>
                        )}
                        <span>{order.tools.length} tool(s)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-40">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{order.progress_percent}%</span>
                          <span className="text-muted-foreground">
                            {order.picked_items}/{order.total_items} parts
                          </span>
                        </div>
                        <Progress value={order.progress_percent} className="h-2" />
                      </div>

                      <div className="flex gap-2">
                        <Button asChild variant={isComplete || isCancelled ? 'outline' : 'default'}>
                          <Link to={`/orders/${order.id}`}>
                            {isComplete || isCancelled ? 'View' : 'Pick'}
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteOrder(order.id, order.so_number)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Order Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Delete Order
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete order{' '}
              <span className="font-semibold text-foreground">SO-{deleteTarget?.soNumber}</span>?
              All tools, line items, and pick records will be permanently removed.
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                Type the phrase below to confirm:
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-sm font-mono font-semibold text-red-600 dark:text-red-400">
                {CONFIRM_PHRASE}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText('');
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteOrder}
              disabled={deleteConfirmText.toLowerCase() !== CONFIRM_PHRASE || isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Order Dialog */}
      <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Order</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="so_number">SO Number *</Label>
              <Input
                id="so_number"
                placeholder="e.g., 3137"
                value={newOrder.so_number}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, so_number: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                placeholder="Customer PO"
                value={newOrder.po_number}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, po_number: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer</Label>
              <Input
                id="customer_name"
                placeholder="Customer name"
                value={newOrder.customer_name}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, customer_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool_model">Tool Model</Label>
              <Input
                id="tool_model"
                placeholder="e.g., 230Q, NG1"
                value={newOrder.tool_model}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, tool_model: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity (# of Tools)</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                placeholder="1"
                value={newOrder.quantity}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, quantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_date">Order Date</Label>
              <Input
                id="order_date"
                type="date"
                value={newOrder.order_date}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, order_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={newOrder.due_date}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, due_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_ship_date">Est. Ship Date</Label>
              <Input
                id="estimated_ship_date"
                type="date"
                value={newOrder.estimated_ship_date}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, estimated_ship_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={newOrder.notes}
                onChange={(e) =>
                  setNewOrder({ ...newOrder, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOrderDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={!newOrder.so_number.trim()}
            >
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
