import { useState, useMemo } from 'react';
import { CheckCircle2, Package, Plus, Settings } from 'lucide-react';
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
import { FilterMultiSelect } from '@/components/filters';
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
  onPickAllRemainingTools: (lineItemId: string) => Promise<{ toolNumber: string; qty: number }[]>;
  onReportIssue: (lineItemId: string, orderId: string, issueType: IssueType, description?: string, reportedBy?: string) => Promise<boolean>;
  hasOpenIssue: (lineItemId: string) => boolean;
  onBatchUpdateAllocations: (lineItemId: string, newAllocations: Map<string, number>, pickedBy?: string, notes?: string) => Promise<boolean>;
  onDeleteLineItem?: (lineItemId: string) => Promise<boolean>;
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
  onDeleteLineItem,
}: PickingSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssemblies, setSelectedAssemblies] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Compute unique assemblies from tools AND line items (subassemblies) for filter dropdown
  const assemblyOptions = useMemo(() => {
    const assemblies = new Set<string>();

    // Add tool assemblies (tool_model)
    tools.forEach(tool => {
      if (tool.tool_model) assemblies.add(tool.tool_model);
    });

    // Add part subassemblies (assembly_group)
    lineItems.forEach(item => {
      if (item.assembly_group) assemblies.add(item.assembly_group);
    });

    return Array.from(assemblies)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(asm => ({ value: asm, label: asm }));
  }, [tools, lineItems]);

  // Get tool IDs that match selected assemblies (for tool_model filtering)
  const toolIdsForSelectedAssemblies = useMemo(() => {
    if (selectedAssemblies.size === 0) return null; // null means no filter
    return new Set(
      tools
        .filter(tool => tool.tool_model && selectedAssemblies.has(tool.tool_model))
        .map(tool => tool.id)
    );
  }, [tools, selectedAssemblies]);

  // Filter items based on search query and assembly filter
  const filteredLineItems = lineItems.filter(item => {
    // Assembly filter: check both tool assembly AND part's assembly_group
    if (selectedAssemblies.size > 0) {
      // Check if part's own assembly_group matches
      const partAssemblyMatches = item.assembly_group && selectedAssemblies.has(item.assembly_group);

      // Check if part belongs to a tool with matching assembly
      let toolAssemblyMatches = false;
      if (toolIdsForSelectedAssemblies && toolIdsForSelectedAssemblies.size > 0) {
        if (!item.tool_ids || item.tool_ids.length === 0) {
          // Part applies to all tools, matches if any tool has selected assembly
          toolAssemblyMatches = true;
        } else {
          // Part is assigned to specific tools - check if any match
          toolAssemblyMatches = item.tool_ids.some(tid => toolIdsForSelectedAssemblies.has(tid));
        }
      }

      // Part passes filter if either its assembly_group matches OR it belongs to a matching tool
      if (!partAssemblyMatches && !toolAssemblyMatches) return false;
    }

    // Search filter
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      item.part_number.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.location?.toLowerCase().includes(query) ||
      item.assembly_group?.toLowerCase().includes(query)
    );
  });

  const filteredLineItemsWithPicks = lineItemsWithPicks.filter(item => {
    // Assembly filter: check both tool assembly AND part's assembly_group
    if (selectedAssemblies.size > 0) {
      const partAssemblyMatches = item.assembly_group && selectedAssemblies.has(item.assembly_group);

      let toolAssemblyMatches = false;
      if (toolIdsForSelectedAssemblies && toolIdsForSelectedAssemblies.size > 0) {
        if (!item.tool_ids || item.tool_ids.length === 0) {
          toolAssemblyMatches = true;
        } else {
          toolAssemblyMatches = item.tool_ids.some(tid => toolIdsForSelectedAssemblies.has(tid));
        }
      }

      if (!partAssemblyMatches && !toolAssemblyMatches) return false;
    }

    // Search filter
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      item.part_number.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.location?.toLowerCase().includes(query) ||
      item.assembly_group?.toLowerCase().includes(query)
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
            // Only count line items that apply to this tool
            const applicableItems = lineItems.filter(item =>
              !item.tool_ids || item.tool_ids.length === 0 || item.tool_ids.includes(tool.id)
            );
            const toolTotalItems = applicableItems.length;
            const toolCompletedItems = applicableItems.filter(item => {
              const picked = toolPicks.get(item.id) || 0;
              return picked >= item.qty_per_unit;
            }).length;
            const toolProgress =
              toolTotalItems > 0 ? Math.round((toolCompletedItems / toolTotalItems) * 100) : 0;

            return (
              <div
                key={tool.id}
                className={cn(
                  'flex flex-col items-center px-2 py-1 rounded-full text-xs font-medium flex-shrink-0',
                  toolProgress === 100
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : toolProgress > 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                )}
                title={[
                  tool.tool_number,
                  tool.tool_model ? `Model: ${tool.tool_model}` : null,
                  tool.serial_number ? `SN: ${tool.serial_number}` : null,
                  `Progress: ${toolProgress}%`,
                ].filter(Boolean).join(' | ')}
              >
                <span className="flex items-center gap-1">
                  {tool.tool_number}
                  {toolProgress === 100 && (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {toolProgress > 0 && toolProgress < 100 && (
                    <span>{toolProgress}%</span>
                  )}
                </span>
                {tool.tool_model && (
                  <span className="text-[0.6rem] leading-none opacity-75">{tool.tool_model}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons row - sticky on mobile so filters stay accessible while picking */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-2 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:backdrop-blur-none">
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
            <Select value={toolFilter} onValueChange={onToolFilterChange}>
              <SelectTrigger className="h-9 w-40 sm:w-44">
                <SelectValue placeholder="All Tools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tools</SelectItem>
                {tools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.tool_number}{tool.tool_model ? ` [${tool.tool_model}]` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Filter by Assembly Dropdown */}
          {assemblyOptions.length > 0 && (
            <FilterMultiSelect
              label="Assembly"
              options={assemblyOptions}
              selected={selectedAssemblies}
              onChange={setSelectedAssemblies}
              allLabel="All Assemblies"
              width="w-40 sm:w-44"
            />
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
      </div>

      {/* Search/filter results indicator */}
      {(debouncedSearch || selectedAssemblies.size > 0) && (
        <div className="text-sm text-muted-foreground">
          {filteredLineItems.length} of {lineItems.length} parts
          {debouncedSearch && ` match "${debouncedSearch}"`}
          {selectedAssemblies.size > 0 && ` (filtered by ${selectedAssemblies.size} assembl${selectedAssemblies.size === 1 ? 'y' : 'ies'})`}
        </div>
      )}

      {/* Unified Picking Interface */}
      <Card>
        <CardContent className="pt-4">
          <PickingInterface
            tool={tools.find(t => t.id === currentToolId) || tools[0]}
            allTools={tools}
            orderId={order.id}
            soNumber={order.so_number}
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
            onDeleteLineItem={onDeleteLineItem}
            toolFilter={toolFilter}
          />
        </CardContent>
      </Card>
    </div>
  );
}
