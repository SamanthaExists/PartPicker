import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { PartIssue, PartIssueType } from '@/types';

export function usePartIssues() {
  const [issues, setIssues] = useState<PartIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('part_issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch part issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIssues();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('part-issues-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'part_issues' },
        () => fetchIssues()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchIssues]);

  const reportIssue = async (
    partNumber: string,
    issueType: PartIssueType,
    description?: string,
    reportedBy?: string
  ): Promise<PartIssue | null> => {
    try {
      const { data, error } = await supabase
        .from('part_issues')
        .insert({
          part_number: partNumber,
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
        .from('part_issues')
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
        .from('part_issues')
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
        .from('part_issues')
        .delete()
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete issue');
      return false;
    }
  };

  const getIssuesForPart = useCallback(
    (partNumber: string) => {
      return issues.filter((issue) => issue.part_number === partNumber);
    },
    [issues]
  );

  const hasOpenIssue = useCallback(
    (partNumber: string) => {
      return issues.some(
        (issue) => issue.part_number === partNumber && issue.status === 'open'
      );
    },
    [issues]
  );

  const getOpenIssue = useCallback(
    (partNumber: string): PartIssue | undefined => {
      return issues.find(
        (issue) => issue.part_number === partNumber && issue.status === 'open'
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
    getIssuesForPart,
    hasOpenIssue,
    getOpenIssue,
  };
}

// Utility function to get issue type label
export function getPartIssueTypeLabel(type: PartIssueType): string {
  const labels: Record<PartIssueType, string> = {
    inventory_discrepancy: 'Inventory Discrepancy',
    wrong_location: 'Wrong Location',
    damaged: 'Damaged',
    other: 'Other',
  };
  return labels[type] || type;
}

// Utility function to get issue type color
export function getPartIssueTypeColor(type: PartIssueType): string {
  const colors: Record<PartIssueType, string> = {
    inventory_discrepancy: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    wrong_location: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };
  return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
