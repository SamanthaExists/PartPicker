import { useMemo, useCallback } from 'react';
import { useAllIssues } from './useIssues';
import { usePartIssues } from './usePartIssues';
import type { AnyIssueType, UnifiedIssue } from '@/types';

export function useUnifiedIssues() {
  const orderIssues = useAllIssues();
  const partIssues = usePartIssues();

  const issues = useMemo<UnifiedIssue[]>(() => {
    const mapped: UnifiedIssue[] = [];

    // Map line-item issues
    for (const issue of orderIssues.issues) {
      mapped.push({
        id: issue.id,
        source: 'order',
        issue_type: issue.issue_type,
        description: issue.description,
        reported_by: issue.reported_by,
        status: issue.status,
        created_at: issue.created_at,
        resolved_at: issue.resolved_at,
        resolved_by: issue.resolved_by,
        part_number: issue.line_item?.part_number ?? null,
        part_description: issue.line_item?.description ?? null,
        so_number: issue.order?.so_number ?? null,
        order_id: issue.order_id,
        tool_model: issue.order?.tool_model ?? null,
      });
    }

    // Map part issues
    for (const issue of partIssues.issues) {
      mapped.push({
        id: issue.id,
        source: 'part',
        issue_type: issue.issue_type,
        description: issue.description,
        reported_by: issue.reported_by,
        status: issue.status,
        created_at: issue.created_at,
        resolved_at: issue.resolved_at,
        resolved_by: issue.resolved_by,
        part_number: issue.part_number,
        part_description: null,
        so_number: null,
        order_id: null,
        tool_model: null,
      });
    }

    // Sort by created_at descending
    mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return mapped;
  }, [orderIssues.issues, partIssues.issues]);

  const loading = orderIssues.loading || partIssues.loading;
  const error = orderIssues.error || partIssues.error;

  const refresh = useCallback(() => {
    orderIssues.refresh();
    partIssues.refresh();
  }, [orderIssues.refresh, partIssues.refresh]);

  const resolveIssue = useCallback(
    async (issue: UnifiedIssue, resolvedBy?: string): Promise<boolean> => {
      if (issue.source === 'order') {
        return orderIssues.resolveIssue(issue.id, resolvedBy);
      }
      return partIssues.resolveIssue(issue.id, resolvedBy);
    },
    [orderIssues.resolveIssue, partIssues.resolveIssue]
  );

  const reopenIssue = useCallback(
    async (issue: UnifiedIssue): Promise<boolean> => {
      if (issue.source === 'order') {
        return orderIssues.reopenIssue(issue.id);
      }
      return partIssues.reopenIssue(issue.id);
    },
    [orderIssues.reopenIssue, partIssues.reopenIssue]
  );

  return { issues, loading, error, refresh, resolveIssue, reopenIssue };
}

// Unified label function for all issue types
export function getUnifiedIssueTypeLabel(type: AnyIssueType): string {
  const labels: Record<string, string> = {
    out_of_stock: 'Out of Stock',
    wrong_part: 'Wrong Part',
    damaged: 'Damaged',
    other: 'Other',
    inventory_discrepancy: 'Inventory Discrepancy',
    wrong_location: 'Wrong Location',
  };
  return labels[type] || type;
}

// Unified color function for all issue types
export function getUnifiedIssueTypeColor(type: AnyIssueType): string {
  const colors: Record<string, string> = {
    out_of_stock: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    wrong_part: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    inventory_discrepancy: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    wrong_location: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  };
  return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
