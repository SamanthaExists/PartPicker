import { useState } from 'react';
import { CheckCircle2, Package, Plus, Settings, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/common/SearchInput';
import { PickingInterface } from '@/components/picking/PickingInterface';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Order, Tool, LineItem, LineItemWithPicks, Pick, IssueType } from '@/types';
import { cn } from '@/lib/utils';

interface PickingSectionProps {
  order: Order;
  tools: Tool[];
  lineItems: LineItem[];
  lineItemsWithPicks: LineItemWithPicks[];
  picks: Pick[];
  currentToolId: string | undefined;
  toolFilter: string;
  onToolFilterChange: (value: string) => void;
  onManageToolsClick: () => void;
  onAddPartClick: () => void;
  onRecordPick: (lineItemId: string, toolId: string, qtyPicked: number, pickedBy?: string, notes?: string) => Promise<Pick | null>;
  onUndoPick: (pickId: string, undoneBy?: string) => Promise<boolean>;
  getPicksForTool: (toolId: string) => Map<string, number>;
  getPicksForAllTools: () => Map<string, Map<string, number>>;
  getPickHistory: (lineItemId: string, toolId: string) => Pick[];
  onPickAllRemainingTools: (lineItemId: string) => Promise<void>;
  onReportIssue: (lineItemId: string, orderId: string, issueType: IssueType, description?: string, reportedBy?: string) => Promise<boolean>;
  hasOpenIssue: (lineItemId: string) => boolean;
  onBatchUpdateAllocations: (lineItemId: string, newAllocations: Map<string, number>, pickedBy?: string, notes?: string) => Promise<boolean>;
}

export function PickingSection({
  order,
  tools,
  lineItems,
  lineItemsWithPicks,
  picks,
  currentToolId,
  toolFilter,
  onToolFilterChange,
  onManageToolsClick,
  onAddPartClick,
  onRecordPick,
  onUndoPick,
  getPicksForTool,
  getPicksForAllTools,
  getPickHistory,
  onPickAllRemainingTools,
  onReportIssue,
  hasOpenIssue,
  onBatchUpdateAllocations,
}: PickingSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Filter items based on search query
  const filteredLineItems = lineItems.filter(item => {
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      item.part_number.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.location?.toLowerCase().includes(query)
    );
  });

  const filteredLineItemsWithPicks = lineItemsWithPicks.filter(item => {
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      item.part_number.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.location?.toLowerCase().includes(query)
    );
  });

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No tools defined for this order</p>
          <p className="text-sm text-muted-foreground mt-2">
            Import an Excel file with tool definitions or add tools manually
          </p>
          <Button className="mt-4" onClick={onManageToolsClick}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tool
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Unified Picking Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Title and Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-semibold">Picking</h2>
          <Badge variant="secondary" className="text-xs">{lineItems.length} parts</Badge>
          <Badge variant="outline" className="text-xs">{tools.length} tool(s)</Badge>
        </div>

        {/* Tool Progress Pills - Scrollable on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1 -mb-1">
          {tools.map((tool) => {
            const toolPicks = getPicksForTool(tool.id);
            const toolTotalItems = lineItems.length;
            const toolCompletedItems = lineItems.filter(item => {
              const picked = toolPicks.get(item.id) || 0;
              return picked >= item.qty_per_unit;
            }).length;
            const toolProgress =
              toolTotalItems > 0 ? Math.round((toolCompletedItems / toolTotalItems) * 100) : 0;

            return (
              <div
                key={tool.id}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0',
                  toolProgress === 100
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : toolProgress > 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                )}
              >
                {tool.tool_number}
                {toolProgress === 100 && (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {toolProgress > 0 && toolProgress < 100 && (
                  <span>{toolProgress}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Part Search Input */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search parts..."
          className="w-40 sm:w-52"
        />

        {/* Filter by Tool Dropdown */}
        {tools.length > 1 && (
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={toolFilter} onValueChange={onToolFilterChange}>
              <SelectTrigger className="h-8 w-32 sm:w-40">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tools</SelectItem>
                {tools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.tool_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Manage Tools Button */}
        <Button variant="outline" size="sm" className="h-8" onClick={onManageToolsClick}>
          <Settings className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Manage Tools</span>
        </Button>

        <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={onAddPartClick}>
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Add Part</span>
        </Button>
      </div>

      {/* Search results indicator */}
      {debouncedSearch && (
        <div className="text-sm text-muted-foreground">
          {filteredLineItems.length} of {lineItems.length} parts match "{debouncedSearch}"
        </div>
      )}

      {/* Unified Picking Interface */}
      <Card>
        <CardContent className="pt-4">
          <PickingInterface
            tool={tools.find(t => t.id === currentToolId) || tools[0]}
            allTools={tools}
            orderId={order.id}
            lineItems={filteredLineItems}
            lineItemsWithPicks={filteredLineItemsWithPicks}
            picks={picks}
            onRecordPick={onRecordPick}
            onUndoPick={onUndoPick}
            getPicksForTool={getPicksForTool}
            getPicksForAllTools={getPicksForAllTools}
            getPickHistory={getPickHistory}
            onPickAllRemainingTools={onPickAllRemainingTools}
            onReportIssue={onReportIssue}
            hasOpenIssue={hasOpenIssue}
            onBatchUpdateAllocations={onBatchUpdateAllocations}
            toolFilter={toolFilter}
          />
        </CardContent>
      </Card>
    </div>
  );
}
