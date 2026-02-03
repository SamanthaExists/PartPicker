import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Package, CheckCircle, AlertCircle, Download, Plus, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PrintPickList } from '@/components/picking/PrintPickList';
import { LineItemDialog } from '@/components/picking/LineItemDialog';
import { DeleteConfirmDialog } from '@/components/picking/DeleteConfirmDialog';
import { SaveAsTemplateDialog } from '@/components/dialogs/SaveAsTemplateDialog';
import { ManageToolsDialog } from '@/components/dialogs/ManageToolsDialog';
import { OrderStatusAlerts } from '@/components/order/OrderStatusAlerts';
import { OrderInfoCard } from '@/components/order/OrderInfoCard';
import { PickingSection } from '@/components/order/PickingSection';
import { useOrder, useOrders } from '@/hooks/useOrders';
import { useBOMTemplates } from '@/hooks/useBOMTemplates';
import { usePicks } from '@/hooks/usePicks';
import { useLineItems, type LineItemInput } from '@/hooks/useLineItems';
import { useIssues } from '@/hooks/useIssues';
import { useSettings } from '@/hooks/useSettings';
import type { Tool, LineItem } from '@/types';
import { getStatusColor } from '@/lib/utils';
import { exportOrderToExcel } from '@/lib/excelExport';

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { order, tools, lineItems, loading, error: orderError, refresh, addTool, deleteTool, generateNextToolNumber } = useOrder(id);

  const { updateOrder } = useOrders();
  const { lineItemsWithPicks, picks, recordPick, undoPick, getPicksForTool, getPickHistory, getPicksForAllTools, batchUpdateAllocations } = usePicks(id);
  const { addLineItem, updateLineItem, deleteLineItem, loading: lineItemLoading } = useLineItems(id);
  const { reportIssue, hasOpenIssue } = useIssues(id);
  const { getUserName } = useSettings();
  const { createTemplateFromOrder } = useBOMTemplates();

  // UI state
  const [showCompletionSuggestion, setShowCompletionSuggestion] = useState(false);
  const [currentToolId, setCurrentToolId] = useState<string | undefined>(undefined);
  const [toolFilter, setToolFilter] = useState<string>('all');

  // Dialog state
  const [isManageToolsOpen, setIsManageToolsOpen] = useState(false);
  const [isAddLineItemOpen, setIsAddLineItemOpen] = useState(false);
  const [lineItemToEdit, setLineItemToEdit] = useState<LineItem | null>(null);
  const [lineItemToDelete, setLineItemToDelete] = useState<LineItem | null>(null);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);

  // Calculate overall progress by line items (parts), not quantities
  const totalLineItems = lineItemsWithPicks.length;
  const completedLineItems = lineItemsWithPicks.filter(
    item => item.total_picked >= item.total_qty_needed
  ).length;
  const progressPercent = totalLineItems > 0 ? Math.round((completedLineItems / totalLineItems) * 100) : 0;
  const isFullyPicked = progressPercent === 100 && totalLineItems > 0;

  // Set initial current tool ID when tools load
  useEffect(() => {
    if (tools.length > 0 && !currentToolId) {
      setCurrentToolId(tools[0].id);
    }
  }, [tools, currentToolId]);

  // Auto-suggest completion when 100% picked and order is still active
  useEffect(() => {
    if (isFullyPicked && order?.status === 'active') {
      setShowCompletionSuggestion(true);
    } else {
      setShowCompletionSuggestion(false);
    }
  }, [isFullyPicked, order?.status]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading order...</p>
      </div>
    );
  }

  // Error state
  if (orderError) {
    return (
      <div className="space-y-4">
        <Link to="/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <CardContent className="py-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
            <p className="text-red-600 dark:text-red-400 font-medium">Error loading order</p>
            <p className="text-red-500 dark:text-red-400 text-sm mt-2">{orderError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not found state
  if (!order) {
    return (
      <div className="space-y-4">
        <Link to="/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Order not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handlers
  const handleStatusChange = async (newStatus: string) => {
    await updateOrder(order.id, { status: newStatus as 'active' | 'complete' | 'cancelled' });
    refresh();
  };

  const handleMarkComplete = async () => {
    await updateOrder(order.id, { status: 'complete' });
    setShowCompletionSuggestion(false);
    refresh();
  };

  const handleOrderInfoSave = async (updates: Partial<typeof order>) => {
    await updateOrder(order.id, updates);
    refresh();
  };

  const handleExport = () => {
    exportOrderToExcel(order, tools, lineItemsWithPicks, picks);
  };

  const handleSaveAsTemplate = async (name: string, toolModel: string | null): Promise<boolean> => {
    const result = await createTemplateFromOrder(name, toolModel, lineItems);
    return result !== null;
  };

  // Line item handlers
  const handleAddLineItem = async (input: LineItemInput): Promise<boolean> => {
    const result = await addLineItem(input);
    if (result) {
      refresh();
      return true;
    }
    return false;
  };

  const handleEditLineItem = async (lineItemId: string, input: LineItemInput): Promise<boolean> => {
    const result = await updateLineItem(lineItemId, input);
    if (result) {
      refresh();
      return true;
    }
    return false;
  };

  const handleDeleteLineItem = async (lineItemId: string): Promise<boolean> => {
    const result = await deleteLineItem(lineItemId);
    if (result) {
      refresh();
      return true;
    }
    return false;
  };

  // Tool handlers
  const handleAddToolFromDialog = async (toolNumber: string, serialNumber?: string): Promise<Tool | null> => {
    const newTool = await addTool(toolNumber, serialNumber);
    if (newTool) {
      setCurrentToolId(newTool.id);
    }
    return newTool;
  };

  const handleDeleteToolFromDialog = async (toolId: string): Promise<boolean> => {
    const success = await deleteTool(toolId);
    if (success) {
      if (currentToolId === toolId) {
        const remainingTools = tools.filter(t => t.id !== toolId);
        setCurrentToolId(remainingTools.length > 0 ? remainingTools[0].id : undefined);
      }
      if (toolFilter === toolId) {
        setToolFilter('all');
      }
    }
    return success;
  };

  const handlePickAllRemainingTools = async (lineItemId: string): Promise<void> => {
    const lineItem = lineItems.find(li => li.id === lineItemId);
    if (!lineItem) return;

    const allToolsPicksMap = getPicksForAllTools();
    const userName = getUserName();

    const pickPromises = tools
      .filter(t => {
        const toolPicks = allToolsPicksMap.get(t.id);
        const picked = toolPicks?.get(lineItemId) || 0;
        return picked < lineItem.qty_per_unit;
      })
      .map(t => {
        const toolPicks = allToolsPicksMap.get(t.id);
        const picked = toolPicks?.get(lineItemId) || 0;
        const remaining = lineItem.qty_per_unit - picked;
        return recordPick(lineItemId, t.id, remaining, userName);
      });

    await Promise.all(pickPromises);
  };

  const getToolPickCount = (toolId: string): number => {
    const toolPicks = getPicksForTool(toolId);
    return Array.from(toolPicks.values()).reduce((sum, qty) => sum + qty, 0);
  };

  return (
    <div className="space-y-4">
      {/* Status Alerts */}
      <OrderStatusAlerts
        order={order}
        showCompletionSuggestion={showCompletionSuggestion}
        onMarkComplete={handleMarkComplete}
        onDismissCompletionSuggestion={() => setShowCompletionSuggestion(false)}
      />

      {/* Header */}
      <div className="space-y-3">
        <Link to="/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        {/* Title and Status Row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">SO-{order.so_number}</h1>
          <Select value={order.status} onValueChange={handleStatusChange}>
            <SelectTrigger className={`w-24 sm:w-28 h-8 text-xs sm:text-sm ${getStatusColor(order.status)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {isFullyPicked && order.status === 'active' && (
            <Button size="sm" onClick={handleMarkComplete} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Mark </span>Complete
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">Progress:</span>
          <Progress value={progressPercent} className="h-2 flex-1 min-w-0" />
          <span className="text-sm font-semibold whitespace-nowrap">{progressPercent}%</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">({completedLineItems}/{totalLineItems} parts)</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          {lineItems.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setIsSaveTemplateOpen(true)}>
              <FileText className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Save Template</span>
            </Button>
          )}
          {tools.length > 0 && (
            <PrintPickList
              order={order}
              tools={tools}
              lineItems={lineItems}
              getPicksForTool={getPicksForTool}
              currentToolId={currentToolId}
            />
          )}
        </div>
      </div>

      {/* Order Info Card */}
      <OrderInfoCard
        order={order}
        tools={tools}
        onSave={handleOrderInfoSave}
      />

      {/* Picking Section */}
      <PickingSection
        order={order}
        tools={tools}
        lineItems={lineItems}
        lineItemsWithPicks={lineItemsWithPicks}
        picks={picks}
        currentToolId={currentToolId}
        toolFilter={toolFilter}
        onToolFilterChange={setToolFilter}
        onManageToolsClick={() => setIsManageToolsOpen(true)}
        onAddPartClick={() => setIsAddLineItemOpen(true)}
        onRecordPick={recordPick}
        onUndoPick={undoPick}
        getPicksForTool={getPicksForTool}
        getPicksForAllTools={getPicksForAllTools}
        getPickHistory={getPickHistory}
        onPickAllRemainingTools={handlePickAllRemainingTools}
        onReportIssue={async (lineItemId, orderId, issueType, description, reportedBy) => {
          const result = await reportIssue(lineItemId, orderId, issueType, description, reportedBy);
          return result !== null;
        }}
        hasOpenIssue={hasOpenIssue}
        onBatchUpdateAllocations={batchUpdateAllocations}
      />

      {/* Dialogs */}
      <ManageToolsDialog
        open={isManageToolsOpen}
        onOpenChange={setIsManageToolsOpen}
        tools={tools}
        soNumber={order.so_number}
        onAddTool={handleAddToolFromDialog}
        onDeleteTool={handleDeleteToolFromDialog}
        getToolPickCount={getToolPickCount}
        generateNextToolNumber={() => generateNextToolNumber(order.so_number, tools)}
      />

      <LineItemDialog
        open={isAddLineItemOpen}
        onOpenChange={setIsAddLineItemOpen}
        onSave={async (input) => {
          const success = await handleAddLineItem(input);
          if (success) setIsAddLineItemOpen(false);
          return success;
        }}
        isLoading={lineItemLoading}
      />

      <LineItemDialog
        open={lineItemToEdit !== null}
        onOpenChange={(open) => !open && setLineItemToEdit(null)}
        onSave={async (input) => {
          if (!lineItemToEdit) return false;
          const success = await handleEditLineItem(lineItemToEdit.id, input);
          if (success) setLineItemToEdit(null);
          return success;
        }}
        lineItem={lineItemToEdit}
        isLoading={lineItemLoading}
      />

      <DeleteConfirmDialog
        open={lineItemToDelete !== null}
        onOpenChange={(open) => !open && setLineItemToDelete(null)}
        onConfirm={async () => {
          if (!lineItemToDelete) return;
          await handleDeleteLineItem(lineItemToDelete.id);
          setLineItemToDelete(null);
        }}
        lineItem={lineItemToDelete}
        isLoading={lineItemLoading}
      />

      <SaveAsTemplateDialog
        open={isSaveTemplateOpen}
        onOpenChange={setIsSaveTemplateOpen}
        lineItems={lineItems}
        defaultToolModel={order.tool_model || undefined}
        onSave={handleSaveAsTemplate}
      />
    </div>
  );
}
