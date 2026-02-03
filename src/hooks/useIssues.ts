import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllFromTable } from '@/lib/supabasePagination';
import type { Issue, IssueWithDetails, IssueType } from '@/types';

export function useIssues(orderId?: string) {
  const [issues, setIssues] = useState<IssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use pagination to handle >1000 issues over time
      const data = await fetchAllFromTable<IssueWithDetails>(
        'issues',
        `
          *,
          line_item:line_items(*),
          order:orders(*)
        `,
        {
          filter: orderId ? (q) => q.eq('order_id', orderId) : undefined,
          order: { column: 'created_at', ascending: false },
        }
      );

      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchIssues();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('issues-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues' },
        () => fetchIssues()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchIssues]);

  const reportIssue = async (
    lineItemId: string,
    orderId: string,
    issueType: IssueType,
    description?: string,
    reportedBy?: string
  ): Promise<Issue | null> => {
    try {
      const { data, error } = await supabase
        .from('issues')
        .insert({
          line_item_id: lineItemId,
          order_id: orderId,
          issue_type: issueType,
          description: description || null,
          reported_by: reportedBy || null,
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report issue');
      return null;
    }
  };

  const resolveIssue = async (
    issueId: string,
    resolvedBy?: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy || null,
        })
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve issue');
      return false;
    }
  };

  const reopenIssue = async (issueId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({
          status: 'open',
          resolved_at: null,
          resolved_by: null,
        })
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen issue');
      return false;
    }
  };

  const deleteIssue = async (issueId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete issue');
      return false;
    }
  };

  const getIssuesForLineItem = useCallback(
    (lineItemId: string) => {
      return issues.filter((issue) => issue.line_item_id === lineItemId);
    },
    [issues]
  );

  const hasOpenIssue = useCallback(
    (lineItemId: string) => {
      return issues.some(
        (issue) => issue.line_item_id === lineItemId && issue.status === 'open'
      );
    },
    [issues]
  );

  return {
    issues,
    loading,
    error,
    refresh: fetchIssues,
    reportIssue,
    resolveIssue,
    reopenIssue,
    deleteIssue,
    getIssuesForLineItem,
    hasOpenIssue,
  };
}

// Hook to get all issues across all orders
export function useAllIssues() {
  return useIssues();
}

// Utility function to get issue type label
export function getIssueTypeLabel(type: IssueType): string {
  const labels: Record<IssueType, string> = {
    out_of_stock: 'Out of Stock',
    wrong_part: 'Wrong Part',
    damaged: 'Damaged',
    other: 'Other',
  };
  return labels[type] || type;
}

// Utility function to get issue type color
export function getIssueTypeColor(type: IssueType): string {
  const colors: Record<IssueType, string> = {
    out_of_stock: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    wrong_part: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };
  return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
