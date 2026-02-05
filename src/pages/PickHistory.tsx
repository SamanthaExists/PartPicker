import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { exportPickHistoryToExcel, type PickHistoryItem, type PickUndoHistoryItem, type ActivityLogExportItem } from '@/lib/excelExport';
import { format, parseISO, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  RefreshCw,
  Search,
  User,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  History,
  Undo2,
  Plus,
  Minus,
  Upload,
} from 'lucide-react';
import { SearchInput } from '@/components/common/SearchInput';
import {
  FilterDateRange,
  FilterToggle,
  type DatePreset,
} from '@/components/filters';

interface PickRecord {
  id: string;
  type: 'pick';
  qty_picked: number;
  picked_by: string | null;
  picked_at: string;
  notes: string | null;
  part_number: string;
  description: string | null;
  location: string | null;
  tool_number: string;
  so_number: string;
  order_id: string;
}

interface IssueRecord {
  id: string;
  type: 'issue_created' | 'issue_resolved';
  issue_type: string;
  description: string | null;
  user: string | null;
  timestamp: string;
  part_number: string;
  so_number: string;
  order_id: string;
}

interface UndoRecord {
  id: string;
  type: 'undo';
  qty_picked: number;
  picked_by: string | null;
  undone_by: string;
  undone_at: string;
  picked_at: string;
  part_number: string;
  tool_number: string;
  so_number: string;
  order_id: string;
}

interface ActivityLogRecord {
  id: string;
  type: 'part_added' | 'part_removed' | 'order_imported';
  so_number: string;
  part_number: string | null;
  description: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  order_id: string;
}

type ActivityRecord = PickRecord | IssueRecord | UndoRecord | ActivityLogRecord;

const PAGE_SIZE = 50;

// Quick date range presets
const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', getValue: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }) },
  { label: 'Yesterday', getValue: () => ({ start: startOfDay(subDays(new Date(), 1)), end: endOfDay(subDays(new Date(), 1)) }) },
  { label: 'This Week', getValue: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Last 7 Days', getValue: () => ({ start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }) },
  { label: 'This Month', getValue: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { label: 'Last 30 Days', getValue: () => ({ start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) }) },
];

export function PickHistory() {
  const [picks, setPicks] = useState<PickRecord[]>([]);
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [undos, setUndos] = useState<UndoRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalPickCount, setTotalPickCount] = useState(0);
  const [totalQtyPicked, setTotalQtyPicked] = useState(0);
  const [allUniqueParts, setAllUniqueParts] = useState(0);
  const [allUniqueUsers, setAllUniqueUsers] = useState(0);
  const [totalIssueCount, setTotalIssueCount] = useState(0);
  const [totalUndoCount, setTotalUndoCount] = useState(0);
  const [totalActivityLogCount, setTotalActivityLogCount] = useState(0);

  // Activity type filters
  const [showPicks, setShowPicks] = useState(true);
  const [showIssues, setShowIssues] = useState(true);
  const [showUndos, setShowUndos] = useState(true);
  const [showPartChanges, setShowPartChanges] = useState(true);
  const [showImports, setShowImports] = useState(true);

  // Date/time filters - default to today
  const [startDate, setStartDate] = useState(() => format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [endDate, setEndDate] = useState(() => format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce search query for server-side filtering
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const fetchData = useCallback(async (searchTerm?: string) => {
    try {
      setLoading(true);
      setHasSearched(true);

      const startISO = new Date(startDate).toISOString();
      const endISO = new Date(endDate).toISOString();

      // Use the passed searchTerm or fall back to debouncedSearch
      const activeSearch = searchTerm !== undefined ? searchTerm : debouncedSearch;

      // Fetch picks with server-side search filter
      let picksQuery = supabase
        .from('picks')
        .select(`
          id,
          qty_picked,
          picked_by,
          picked_at,
          notes,
          line_items!inner (
            part_number,
            description,
            location,
            order_id,
            orders!inner (
              so_number
            )
          ),
          tools!inner (
            tool_number
          )
        `, { count: 'exact' })
        .gte('picked_at', startISO)
        .lte('picked_at', endISO);

      // Add search filter if there's a search term
      if (activeSearch) {
        picksQuery = picksQuery.or(
          `picked_by.ilike.%${activeSearch}%,` +
          `line_items.part_number.ilike.%${activeSearch}%,` +
          `line_items.orders.so_number.ilike.%${activeSearch}%,` +
          `tools.tool_number.ilike.%${activeSearch}%`
        );
      }

      const { data: picksData, error: picksError, count: picksCount } = await picksQuery
        .order('picked_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (picksError) {
        console.error('Error fetching picks:', picksError);
      }

      // Transform picks
      const transformedPicks: PickRecord[] = (picksData || []).map((pick: any) => ({
        id: pick.id,
        type: 'pick' as const,
        qty_picked: pick.qty_picked,
        picked_by: pick.picked_by,
        picked_at: pick.picked_at,
        notes: pick.notes,
        part_number: pick.line_items.part_number,
        description: pick.line_items.description,
        location: pick.line_items.location,
        tool_number: pick.tools.tool_number,
        so_number: pick.line_items.orders.so_number,
        order_id: pick.line_items.order_id,
      }));

      setPicks(transformedPicks);
      setTotalPickCount(picksCount || 0);
      setHasMore((picksData?.length || 0) === PAGE_SIZE);

      // Fetch ALL picks for accurate stats using pagination
      // Supabase has a server-side limit of 1000 rows per request
      const STATS_PAGE_SIZE = 1000;
      let allPicksData: any[] = [];
      let statsPage = 0;
      let hasMoreStats = true;

      while (hasMoreStats) {
        let statsQuery = supabase
          .from('picks')
          .select(`
            qty_picked,
            picked_by,
            line_items!inner (
              part_number,
              orders!inner (
                so_number
              )
            ),
            tools!inner (
              tool_number
            )
          `)
          .gte('picked_at', startISO)
          .lte('picked_at', endISO);

        // Add search filter if there's a search term
        if (activeSearch) {
          statsQuery = statsQuery.or(
            `picked_by.ilike.%${activeSearch}%,` +
            `line_items.part_number.ilike.%${activeSearch}%,` +
            `line_items.orders.so_number.ilike.%${activeSearch}%,` +
            `tools.tool_number.ilike.%${activeSearch}%`
          );
        }

        const { data: statsPageData } = await statsQuery.range(
          statsPage * STATS_PAGE_SIZE,
          (statsPage + 1) * STATS_PAGE_SIZE - 1
        );

        if (statsPageData && statsPageData.length > 0) {
          allPicksData = allPicksData.concat(statsPageData);
          hasMoreStats = statsPageData.length === STATS_PAGE_SIZE;
          statsPage++;
        } else {
          hasMoreStats = false;
        }
      }

      const totalQty = allPicksData.reduce((sum: number, p: any) => sum + (p.qty_picked || 0), 0);
      const uniqueParts = new Set(allPicksData.map((p: any) => p.line_items?.part_number).filter(Boolean)).size;
      const uniqueUsers = new Set(allPicksData.map((p: any) => p.picked_by).filter(Boolean)).size;
      setTotalQtyPicked(totalQty);
      setAllUniqueParts(uniqueParts);
      setAllUniqueUsers(uniqueUsers);

      // Fetch issues (only on first page to avoid complexity)
      if (page === 0) {
        const { data: issuesData, error: issuesError } = await supabase
          .from('issues')
          .select(`
            id,
            issue_type,
            description,
            reported_by,
            status,
            created_at,
            resolved_at,
            resolved_by,
            line_items!inner (
              part_number,
              order_id,
              orders!inner (
                so_number
              )
            )
          `)
          .or(`created_at.gte.${startISO},resolved_at.gte.${startISO}`)
          .or(`created_at.lte.${endISO},resolved_at.lte.${endISO}`);

        if (issuesError) {
          console.error('Error fetching issues:', issuesError);
        }

        const transformedIssues: IssueRecord[] = [];

        for (const issue of (issuesData || []) as any[]) {
          // Issue created event
          const createdAt = new Date(issue.created_at);
          if (createdAt >= new Date(startDate) && createdAt <= new Date(endDate)) {
            transformedIssues.push({
              id: `issue-created-${issue.id}`,
              type: 'issue_created',
              issue_type: issue.issue_type,
              description: issue.description,
              user: issue.reported_by,
              timestamp: issue.created_at,
              part_number: issue.line_items.part_number,
              so_number: issue.line_items.orders.so_number,
              order_id: issue.line_items.order_id,
            });
          }

          // Issue resolved event
          if (issue.status === 'resolved' && issue.resolved_at) {
            const resolvedAt = new Date(issue.resolved_at);
            if (resolvedAt >= new Date(startDate) && resolvedAt <= new Date(endDate)) {
              transformedIssues.push({
                id: `issue-resolved-${issue.id}`,
                type: 'issue_resolved',
                issue_type: issue.issue_type,
                description: issue.description,
                user: issue.resolved_by,
                timestamp: issue.resolved_at,
                part_number: issue.line_items.part_number,
                so_number: issue.line_items.orders.so_number,
                order_id: issue.line_items.order_id,
              });
            }
          }
        }

        setIssues(transformedIssues);
        setTotalIssueCount(transformedIssues.length);
      }

      // Fetch undos in date range
      if (page === 0) {
        const { data: undoData, error: undoError } = await supabase
          .from('pick_undos')
          .select('*')
          .gte('undone_at', startISO)
          .lte('undone_at', endISO)
          .order('undone_at', { ascending: false });

        if (undoError) {
          console.error('Error fetching undos:', undoError);
        }

        const transformedUndos: UndoRecord[] = (undoData || []).map((undo: any) => ({
          id: undo.id,
          type: 'undo' as const,
          qty_picked: undo.qty_picked,
          picked_by: undo.picked_by,
          undone_by: undo.undone_by,
          undone_at: undo.undone_at,
          picked_at: undo.picked_at,
          part_number: undo.part_number,
          tool_number: undo.tool_number,
          so_number: undo.so_number,
          order_id: undo.order_id,
        }));

        setUndos(transformedUndos);
        setTotalUndoCount(transformedUndos.length);
      }

      // Fetch activity logs in date range
      if (page === 0) {
        const { data: activityLogData, error: activityLogError } = await supabase
          .from('activity_log')
          .select('*')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false });

        if (activityLogError) {
          console.error('Error fetching activity logs:', activityLogError);
        }

        const transformedActivityLogs: ActivityLogRecord[] = (activityLogData || []).map((log: any) => ({
          id: log.id,
          type: log.type as 'part_added' | 'part_removed' | 'order_imported',
          so_number: log.so_number,
          part_number: log.part_number,
          description: log.description,
          performed_by: log.performed_by,
          details: log.details,
          created_at: log.created_at,
          order_id: log.order_id,
        }));

        setActivityLogs(transformedActivityLogs);
        setTotalActivityLogCount(transformedActivityLogs.length);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setPicks([]);
      setIssues([]);
      setUndos([]);
      setActivityLogs([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, page, debouncedSearch]);

  // Reset to page 0 when date range or search changes
  useEffect(() => {
    setPage(0);
  }, [startDate, endDate, debouncedSearch]);

  // Auto-fetch when search changes (after debounce)
  useEffect(() => {
    if (hasSearched) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Subscribe to real-time changes so activity history auto-refreshes
  useEffect(() => {
    if (!hasSearched) return;

    const subscription = supabase
      .channel('pick-history-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pick_undos' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_log' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [hasSearched, fetchData]);

  // Helper to get timestamp from any activity record
  const getActivityTimestamp = (a: ActivityRecord): string => {
    switch (a.type) {
      case 'pick': return a.picked_at;
      case 'undo': return a.undone_at;
      case 'part_added':
      case 'part_removed':
      case 'order_imported': return a.created_at;
      case 'issue_created':
      case 'issue_resolved': return a.timestamp;
    }
  };

  // Combine and filter activities
  const allActivities = useMemo(() => {
    const activities: ActivityRecord[] = [];

    if (showPicks) {
      activities.push(...picks);
    }

    if (showIssues && page === 0) {
      activities.push(...issues);
    }

    if (showUndos && page === 0) {
      activities.push(...undos);
    }

    if (page === 0) {
      if (showPartChanges) {
        activities.push(...activityLogs.filter(a => a.type === 'part_added' || a.type === 'part_removed'));
      }
      if (showImports) {
        activities.push(...activityLogs.filter(a => a.type === 'order_imported'));
      }
    }

    // Sort by timestamp descending
    activities.sort((a, b) => {
      const timeA = getActivityTimestamp(a);
      const timeB = getActivityTimestamp(b);
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    return activities;
  }, [picks, issues, undos, activityLogs, showPicks, showIssues, showUndos, showPartChanges, showImports, page]);

  // Filter by search query (local filter for instant feedback while debounce pending)
  // Server-side filtering is the primary filter; this provides immediate UI response
  const filteredActivities = useMemo(() => {
    // If search matches debounced, server already filtered - no local filter needed
    if (searchQuery === debouncedSearch) return allActivities;

    // Local filter for instant feedback while waiting for debounced server query
    if (!searchQuery) return allActivities;
    const query = searchQuery.toLowerCase();

    return allActivities.filter(activity => {
      if (activity.type === 'pick') {
        return (
          (activity.picked_by && activity.picked_by.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.tool_number.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query)) ||
          (activity.location && activity.location.toLowerCase().includes(query))
        );
      } else if (activity.type === 'undo') {
        return (
          activity.undone_by.toLowerCase().includes(query) ||
          (activity.picked_by && activity.picked_by.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.tool_number.toLowerCase().includes(query)
        );
      } else if (activity.type === 'part_added' || activity.type === 'part_removed' || activity.type === 'order_imported') {
        return (
          (activity.performed_by && activity.performed_by.toLowerCase().includes(query)) ||
          (activity.part_number && activity.part_number.toLowerCase().includes(query)) ||
          activity.so_number.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query))
        );
      } else if (activity.type === 'issue_created' || activity.type === 'issue_resolved') {
        return (
          (activity.user && activity.user.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.issue_type.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query))
        );
      }
      return false;
    });
  }, [allActivities, searchQuery, debouncedSearch]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce((groups, activity) => {
      const timestamp = getActivityTimestamp(activity);
      const date = format(new Date(timestamp), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
      return groups;
    }, {} as Record<string, ActivityRecord[]>);
  }, [filteredActivities]);

  // Calculate summary stats using full-dataset state variables (not just current page)
  const summaryStats = useMemo(() => {
    const pickCount = showPicks ? totalPickCount : 0;
    const totalQty = showPicks ? totalQtyPicked : 0;
    const uniqueParts = showPicks ? allUniqueParts : 0;
    const uniqueUsers = allUniqueUsers;
    const issueCount = showIssues ? totalIssueCount : 0;
    const undoCount = showUndos ? totalUndoCount : 0;
    const partChangesCount = showPartChanges ? activityLogs.filter(a => a.type === 'part_added' || a.type === 'part_removed').length : 0;
    const importsCount = showImports ? activityLogs.filter(a => a.type === 'order_imported').length : 0;

    return { totalQty, uniqueParts, uniqueUsers, pickCount, issueCount, undoCount, partChangesCount, importsCount };
  }, [showPicks, showIssues, showUndos, showPartChanges, showImports, totalPickCount, totalQtyPicked, allUniqueParts, allUniqueUsers, totalIssueCount, totalUndoCount, activityLogs]);

  // Handle preset selection - also triggers search
  const handlePreset = useCallback((preset: typeof DATE_PRESETS[0]) => {
    const { start, end } = preset.getValue();
    const newStartDate = format(start, "yyyy-MM-dd'T'HH:mm");
    const newEndDate = format(end, "yyyy-MM-dd'T'HH:mm");
    setStartDate(newStartDate);
    setEndDate(newEndDate);

    // Trigger fetch with new dates directly (since setState is async)
    (async () => {
      try {
        setLoading(true);
        setHasSearched(true);
        setPage(0);

        const startISO = new Date(newStartDate).toISOString();
        const endISO = new Date(newEndDate).toISOString();

        // Fetch picks
        const { data: picksData, error: picksError, count: picksCount } = await supabase
          .from('picks')
          .select(`
            id,
            qty_picked,
            picked_by,
            picked_at,
            notes,
            line_items!inner (
              part_number,
              description,
              location,
              order_id,
              orders!inner (
                so_number
              )
            ),
            tools!inner (
              tool_number
            )
          `, { count: 'exact' })
          .gte('picked_at', startISO)
          .lte('picked_at', endISO)
          .order('picked_at', { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (picksError) {
          console.error('Error fetching picks:', picksError);
        }

        // Transform picks
        const transformedPicks: PickRecord[] = (picksData || []).map((pick: any) => ({
          id: pick.id,
          type: 'pick' as const,
          qty_picked: pick.qty_picked,
          picked_by: pick.picked_by,
          picked_at: pick.picked_at,
          notes: pick.notes,
          part_number: pick.line_items.part_number,
          description: pick.line_items.description,
          location: pick.line_items.location,
          tool_number: pick.tools.tool_number,
          so_number: pick.line_items.orders.so_number,
          order_id: pick.line_items.order_id,
        }));

        setPicks(transformedPicks);
        setTotalPickCount(picksCount || 0);
        setHasMore((picksData?.length || 0) === PAGE_SIZE);

        // Fetch ALL picks for accurate stats using pagination
        // Supabase has a server-side limit of 1000 rows per request
        const STATS_PAGE_SIZE = 1000;
        let allPicksData: any[] = [];
        let statsPage = 0;
        let hasMoreStats = true;

        while (hasMoreStats) {
          const { data: statsPageData } = await supabase
            .from('picks')
            .select(`
              qty_picked,
              picked_by,
              line_items!inner (
                part_number
              )
            `)
            .gte('picked_at', startISO)
            .lte('picked_at', endISO)
            .range(statsPage * STATS_PAGE_SIZE, (statsPage + 1) * STATS_PAGE_SIZE - 1);

          if (statsPageData && statsPageData.length > 0) {
            allPicksData = allPicksData.concat(statsPageData);
            hasMoreStats = statsPageData.length === STATS_PAGE_SIZE;
            statsPage++;
          } else {
            hasMoreStats = false;
          }
        }

        {
          const totalQty = allPicksData.reduce((sum: number, p: any) => sum + (p.qty_picked || 0), 0);
          const uniqueParts = new Set(allPicksData.map((p: any) => p.line_items?.part_number).filter(Boolean)).size;
          const uniqueUsers = new Set(allPicksData.map((p: any) => p.picked_by).filter(Boolean)).size;
          setTotalQtyPicked(totalQty);
          setAllUniqueParts(uniqueParts);
          setAllUniqueUsers(uniqueUsers);
        }

        // Fetch issues
        const { data: issuesData, error: issuesError } = await supabase
          .from('issues')
          .select(`
            id,
            issue_type,
            description,
            reported_by,
            status,
            created_at,
            resolved_at,
            resolved_by,
            line_items!inner (
              part_number,
              order_id,
              orders!inner (
                so_number
              )
            )
          `)
          .or(`created_at.gte.${startISO},resolved_at.gte.${startISO}`)
          .or(`created_at.lte.${endISO},resolved_at.lte.${endISO}`);

        if (issuesError) {
          console.error('Error fetching issues:', issuesError);
        }

        const transformedIssues: IssueRecord[] = [];

        for (const issue of (issuesData || []) as any[]) {
          const createdAt = new Date(issue.created_at);
          if (createdAt >= new Date(newStartDate) && createdAt <= new Date(newEndDate)) {
            transformedIssues.push({
              id: `issue-created-${issue.id}`,
              type: 'issue_created',
              issue_type: issue.issue_type,
              description: issue.description,
              user: issue.reported_by,
              timestamp: issue.created_at,
              part_number: issue.line_items.part_number,
              so_number: issue.line_items.orders.so_number,
              order_id: issue.line_items.order_id,
            });
          }

          if (issue.status === 'resolved' && issue.resolved_at) {
            const resolvedAt = new Date(issue.resolved_at);
            if (resolvedAt >= new Date(newStartDate) && resolvedAt <= new Date(newEndDate)) {
              transformedIssues.push({
                id: `issue-resolved-${issue.id}`,
                type: 'issue_resolved',
                issue_type: issue.issue_type,
                description: issue.description,
                user: issue.resolved_by,
                timestamp: issue.resolved_at,
                part_number: issue.line_items.part_number,
                so_number: issue.line_items.orders.so_number,
                order_id: issue.line_items.order_id,
              });
            }
          }
        }

        setIssues(transformedIssues);
        setTotalIssueCount(transformedIssues.length);

        // Fetch undos in date range
        const { data: undoData, error: undoError } = await supabase
          .from('pick_undos')
          .select('*')
          .gte('undone_at', startISO)
          .lte('undone_at', endISO)
          .order('undone_at', { ascending: false });

        if (undoError) {
          console.error('Error fetching undos:', undoError);
        }

        const transformedUndos: UndoRecord[] = (undoData || []).map((undo: any) => ({
          id: undo.id,
          type: 'undo' as const,
          qty_picked: undo.qty_picked,
          picked_by: undo.picked_by,
          undone_by: undo.undone_by,
          undone_at: undo.undone_at,
          picked_at: undo.picked_at,
          part_number: undo.part_number,
          tool_number: undo.tool_number,
          so_number: undo.so_number,
          order_id: undo.order_id,
        }));

        setUndos(transformedUndos);
        setTotalUndoCount(transformedUndos.length);

        // Fetch activity logs
        const { data: activityLogData, error: activityLogError } = await supabase
          .from('activity_log')
          .select('*')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false });

        if (activityLogError) {
          console.error('Error fetching activity logs:', activityLogError);
        }

        const transformedActivityLogs: ActivityLogRecord[] = (activityLogData || []).map((log: any) => ({
          id: log.id,
          type: log.type as 'part_added' | 'part_removed' | 'order_imported',
          so_number: log.so_number,
          part_number: log.part_number,
          description: log.description,
          performed_by: log.performed_by,
          details: log.details,
          created_at: log.created_at,
          order_id: log.order_id,
        }));

        setActivityLogs(transformedActivityLogs);
        setTotalActivityLogCount(transformedActivityLogs.length);
      } catch (err) {
        console.error('Error fetching data:', err);
        setPicks([]);
        setIssues([]);
        setUndos([]);
        setActivityLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Export to Excel - fetches ALL picks in date range using pagination
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);

      const startISO = new Date(startDate).toISOString();
      const endISO = new Date(endDate).toISOString();

      // Fetch ALL picks in date range using pagination (Supabase limits to 1000 per query)
      const EXPORT_PAGE_SIZE = 1000;
      let allPicksData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('picks')
          .select(`
            id,
            qty_picked,
            picked_by,
            picked_at,
            notes,
            line_items!inner (
              part_number,
              orders!inner (
                so_number
              )
            ),
            tools!inner (
              tool_number
            )
          `)
          .gte('picked_at', startISO)
          .lte('picked_at', endISO)
          .order('picked_at', { ascending: false })
          .range(offset, offset + EXPORT_PAGE_SIZE - 1);

        if (error) {
          console.error('Error fetching picks for export:', error);
          return;
        }

        allPicksData = [...allPicksData, ...(data || [])];
        hasMore = (data?.length || 0) === EXPORT_PAGE_SIZE;
        offset += EXPORT_PAGE_SIZE;
      }

      // Apply search filter if active
      let filteredData = allPicksData;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredData = filteredData.filter((pick: any) =>
          (pick.picked_by && pick.picked_by.toLowerCase().includes(query)) ||
          pick.line_items.part_number.toLowerCase().includes(query) ||
          pick.line_items.orders.so_number.toLowerCase().includes(query) ||
          pick.tools.tool_number.toLowerCase().includes(query)
        );
      }

      const exportData: PickHistoryItem[] = filteredData.map((pick: any) => ({
        picked_at: pick.picked_at,
        picked_by: pick.picked_by,
        qty_picked: pick.qty_picked,
        notes: pick.notes,
        part_number: pick.line_items.part_number,
        tool_number: pick.tools.tool_number,
        so_number: pick.line_items.orders.so_number,
      }));

      // Fetch undos for export
      const { data: undoExportData } = await supabase
        .from('pick_undos')
        .select('*')
        .gte('undone_at', startISO)
        .lte('undone_at', endISO)
        .order('undone_at', { ascending: false });

      const undoExport: PickUndoHistoryItem[] = (undoExportData || []).map((undo: any) => ({
        undone_at: undo.undone_at,
        undone_by: undo.undone_by,
        picked_at: undo.picked_at,
        picked_by: undo.picked_by,
        qty_picked: undo.qty_picked,
        part_number: undo.part_number,
        tool_number: undo.tool_number,
        so_number: undo.so_number,
      }));

      // Fetch activity logs for export
      const { data: activityLogExportData } = await supabase
        .from('activity_log')
        .select('*')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });

      const activityLogExport: ActivityLogExportItem[] = (activityLogExportData || []).map((log: any) => ({
        created_at: log.created_at,
        type: log.type,
        performed_by: log.performed_by,
        so_number: log.so_number,
        part_number: log.part_number,
        description: log.description,
      }));

      const dateRange = `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d, yyyy')}`;
      exportPickHistoryToExcel(exportData, `Activity History: ${dateRange}`, undoExport, activityLogExport);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const getActivityIcon = (type: ActivityRecord['type']) => {
    switch (type) {
      case 'pick':
        return <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />;
      case 'undo':
        return <Undo2 className="h-4 w-4 text-red-500 dark:text-red-400" />;
      case 'issue_created':
        return <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />;
      case 'issue_resolved':
        return <CheckCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />;
      case 'part_added':
        return <Plus className="h-4 w-4 text-green-500 dark:text-green-400" />;
      case 'part_removed':
        return <Minus className="h-4 w-4 text-red-500 dark:text-red-400" />;
      case 'order_imported':
        return <Upload className="h-4 w-4 text-blue-500 dark:text-blue-400" />;
    }
  };

  const getActivityBadge = (type: ActivityRecord['type']) => {
    switch (type) {
      case 'pick':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800 text-xs">Pick</Badge>;
      case 'undo':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800 text-xs">Undo</Badge>;
      case 'issue_created':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800 text-xs">Issue</Badge>;
      case 'issue_resolved':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800 text-xs">Resolved</Badge>;
      case 'part_added':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800 text-xs">Part Added</Badge>;
      case 'part_removed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800 text-xs">Part Removed</Badge>;
      case 'order_imported':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800 text-xs">Order Imported</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8" />
            Activity History
          </h1>
          <p className="text-muted-foreground">
            View picks and issues by date range
          </p>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Date & Time Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterDateRange
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onSearch={() => fetchData()}
            presets={DATE_PRESETS}
            onPresetSelect={handlePreset}
            loading={loading}
          />

          {/* Activity Type Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium">Show:</span>
            <FilterToggle label="Picks" checked={showPicks} onChange={setShowPicks} />
            <FilterToggle label="Issues" checked={showIssues} onChange={setShowIssues} />
            <FilterToggle label="Undos" checked={showUndos} onChange={setShowUndos} />
            <FilterToggle label="Part Changes" checked={showPartChanges} onChange={setShowPartChanges} />
            <FilterToggle label="Imports" checked={showImports} onChange={setShowImports} />
          </div>

          {/* Export Button */}
          {hasSearched && filteredActivities.length > 0 && (
            <Button onClick={handleExport} variant="outline" disabled={exporting}>
              <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exporting...' : 'Export Picks to Excel'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <>
          {/* Summary Stats (filter-reactive via summaryStats) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.pickCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Picks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.totalQty.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Qty Picked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.uniqueParts}</div>
                <p className="text-xs text-muted-foreground">Unique Parts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.uniqueUsers}</div>
                <p className="text-xs text-muted-foreground">Users</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.issueCount}</div>
                <p className="text-xs text-muted-foreground">Issues</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summaryStats.undoCount}</div>
                <p className="text-xs text-muted-foreground">Undos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{summaryStats.partChangesCount}</div>
                <p className="text-xs text-muted-foreground">Part Changes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summaryStats.importsCount}</div>
                <p className="text-xs text-muted-foreground">Imports</p>
              </CardContent>
            </Card>
          </div>

          {/* Search Within Results */}
          <Card>
            <CardContent className="pt-6">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search all picks by name, part number, SO number, tool number..."
              />
            </CardContent>
          </Card>

          {/* Activity List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Activity Records
              </CardTitle>
              <CardDescription>
                {filteredActivities.length.toLocaleString()} records found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'No activities match your search' : 'No activities found in this date range'}
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedActivities).map(([date, dayActivities]) => (
                    <div key={date}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background py-1 flex items-center justify-between">
                        <span>{format(parseISO(date), 'EEEE, MMMM d, yyyy')}</span>
                        <Badge variant="secondary" className="text-xs">
                          {dayActivities.length} {dayActivities.length === 1 ? 'record' : 'records'}
                        </Badge>
                      </h3>
                      <div className="space-y-2">
                        {dayActivities.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div className="mt-0.5">
                              {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {activity.type === 'pick' ? (activity.picked_by || 'Unknown')
                                    : activity.type === 'undo' ? activity.undone_by
                                    : activity.type === 'part_added' || activity.type === 'part_removed' || activity.type === 'order_imported' ? (activity.performed_by || 'Unknown')
                                    : ((activity as IssueRecord).user || 'Unknown')}
                                </span>
                                {getActivityBadge(activity.type)}
                                {activity.type === 'pick' && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800 text-xs">
                                    {activity.qty_picked}x
                                  </Badge>
                                )}
                                {activity.type === 'undo' && (
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800 text-xs">
                                    {activity.qty_picked}x
                                  </Badge>
                                )}
                                <Link
                                  to={`/orders/${activity.order_id}`}
                                  className="text-sm text-primary hover:underline"
                                >
                                  SO-{activity.so_number}
                                </Link>
                                {activity.type === 'pick' && (
                                  <Badge variant="secondary" className="text-xs">
                                    {activity.tool_number}
                                  </Badge>
                                )}
                                {activity.type === 'undo' && (
                                  <Badge variant="secondary" className="text-xs">
                                    {activity.tool_number}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {(activity.type === 'part_added' || activity.type === 'part_removed') && activity.part_number && (
                                  <span className="font-mono font-medium">{activity.part_number}</span>
                                )}
                                {activity.type === 'order_imported' && activity.description && (
                                  <span>{activity.description}</span>
                                )}
                                {activity.type === 'pick' && (
                                  <>
                                    <span className="font-mono font-medium">{activity.part_number}</span>
                                    {activity.description && (
                                      <span className="text-muted-foreground"> - {activity.description}</span>
                                    )}
                                  </>
                                )}
                                {activity.type === 'undo' && (
                                  <>
                                    <span className="font-mono font-medium">{activity.part_number}</span>
                                    {activity.picked_by && (
                                      <span className="text-muted-foreground"> - originally picked by {activity.picked_by}</span>
                                    )}
                                  </>
                                )}
                                {(activity.type === 'issue_created' || activity.type === 'issue_resolved') && (
                                  <>
                                    <span className="font-mono font-medium">{activity.part_number}</span>
                                    <span className="text-muted-foreground"> - {activity.issue_type.replace('_', ' ')}</span>
                                  </>
                                )}
                              </p>
                              {activity.type === 'pick' && activity.location && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Location: {activity.location}
                                </p>
                              )}
                              {activity.type === 'pick' && activity.notes && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  Note: {activity.notes}
                                </p>
                              )}
                              {(activity.type === 'issue_created' || activity.type === 'issue_resolved') && activity.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  {activity.description}
                                </p>
                              )}
                              {(activity.type === 'part_added' || activity.type === 'part_removed') && activity.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(getActivityTimestamp(activity)), 'h:mm a')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPage(p => Math.max(0, p - 1));
                        fetchData();
                      }}
                      disabled={page === 0 || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page + 1} of {Math.ceil(totalPickCount / PAGE_SIZE) || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPage(p => p + 1);
                        fetchData();
                      }}
                      disabled={!hasMore || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
