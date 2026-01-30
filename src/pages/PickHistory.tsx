import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { exportPickHistoryToExcel, type PickHistoryItem } from '@/lib/excelExport';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  Clock,
  RefreshCw,
  Search,
  User,
  Package,
  Download,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  History,
} from 'lucide-react';

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

type ActivityRecord = PickRecord | IssueRecord;

const PAGE_SIZE = 50;

// Quick date range presets
const datePresets = [
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
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalPickCount, setTotalPickCount] = useState(0);
  const [totalQtyPicked, setTotalQtyPicked] = useState(0);
  const [allUniqueParts, setAllUniqueParts] = useState(0);
  const [allUniqueUsers, setAllUniqueUsers] = useState(0);
  const [totalIssueCount, setTotalIssueCount] = useState(0);

  // Activity type filters
  const [showPicks, setShowPicks] = useState(true);
  const [showIssues, setShowIssues] = useState(true);

  // Date/time filters - default to today
  const [startDate, setStartDate] = useState(() => format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [endDate, setEndDate] = useState(() => format(endOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [hasSearched, setHasSearched] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setHasSearched(true);

      const startISO = new Date(startDate).toISOString();
      const endISO = new Date(endDate).toISOString();

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

      // Fetch ALL picks for accurate stats (separate lightweight query)
      const { data: allPicksData } = await supabase
        .from('picks')
        .select(`
          qty_picked,
          picked_by,
          line_items!inner (
            part_number
          )
        `)
        .gte('picked_at', startISO)
        .lte('picked_at', endISO);

      if (allPicksData) {
        const totalQty = allPicksData.reduce((sum: number, p: any) => sum + (p.qty_picked || 0), 0);
        const uniqueParts = new Set(allPicksData.map((p: any) => p.line_items?.part_number).filter(Boolean)).size;
        const uniqueUsers = new Set(allPicksData.map((p: any) => p.picked_by).filter(Boolean)).size;
        setTotalQtyPicked(totalQty);
        setAllUniqueParts(uniqueParts);
        setAllUniqueUsers(uniqueUsers);
      }

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
    } catch (err) {
      console.error('Error fetching data:', err);
      setPicks([]);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, page]);

  // Reset to page 0 when date range changes
  useEffect(() => {
    setPage(0);
  }, [startDate, endDate]);

  // Combine and filter activities
  const allActivities = useMemo(() => {
    const activities: ActivityRecord[] = [];

    if (showPicks) {
      activities.push(...picks);
    }

    if (showIssues && page === 0) {
      activities.push(...issues);
    }

    // Sort by timestamp descending
    activities.sort((a, b) => {
      const timeA = a.type === 'pick' ? a.picked_at : a.timestamp;
      const timeB = b.type === 'pick' ? b.picked_at : b.timestamp;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    return activities;
  }, [picks, issues, showPicks, showIssues, page]);

  // Filter by search query
  const filteredActivities = useMemo(() => {
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
      } else {
        return (
          (activity.user && activity.user.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.issue_type.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query))
        );
      }
    });
  }, [allActivities, searchQuery]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce((groups, activity) => {
      const timestamp = activity.type === 'pick' ? activity.picked_at : activity.timestamp;
      const date = format(new Date(timestamp), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
      return groups;
    }, {} as Record<string, ActivityRecord[]>);
  }, [filteredActivities]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const picksOnly = filteredActivities.filter((a): a is PickRecord => a.type === 'pick');
    const issuesOnly = filteredActivities.filter((a): a is IssueRecord => a.type !== 'pick');

    const totalQty = picksOnly.reduce((sum, p) => sum + p.qty_picked, 0);
    const uniqueParts = new Set(picksOnly.map(p => p.part_number)).size;
    const uniqueUsers = new Set([
      ...picksOnly.filter(p => p.picked_by).map(p => p.picked_by),
      ...issuesOnly.filter(i => i.user).map(i => i.user),
    ]).size;
    const issueCount = issuesOnly.length;

    return { totalQty, uniqueParts, uniqueUsers, pickCount: picksOnly.length, issueCount };
  }, [filteredActivities]);

  // Handle preset selection - also triggers search
  const handlePreset = useCallback((preset: typeof datePresets[0]) => {
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

        // Fetch ALL picks for accurate stats (separate lightweight query)
        const { data: allPicksData } = await supabase
          .from('picks')
          .select(`
            qty_picked,
            picked_by,
            line_items!inner (
              part_number
            )
          `)
          .gte('picked_at', startISO)
          .lte('picked_at', endISO);

        if (allPicksData) {
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
      } catch (err) {
        console.error('Error fetching data:', err);
        setPicks([]);
        setIssues([]);
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

      const dateRange = `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d, yyyy')}`;
      exportPickHistoryToExcel(exportData, `Activity History: ${dateRange}`);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const getActivityIcon = (type: ActivityRecord['type']) => {
    switch (type) {
      case 'pick':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'issue_created':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'issue_resolved':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getActivityBadge = (type: ActivityRecord['type']) => {
    switch (type) {
      case 'pick':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">Pick</Badge>;
      case 'issue_created':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Issue</Badge>;
      case 'issue_resolved':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Resolved</Badge>;
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
          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {datePresets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => handlePreset(preset)}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Custom Date/Time Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Start Date & Time
              </Label>
              <Input
                id="start-date"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                End Date & Time
              </Label>
              <Input
                id="end-date"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Activity Type Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium">Show:</span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={showPicks}
                onCheckedChange={(checked) => setShowPicks(checked === true)}
              />
              <span className="text-sm">Picks</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={showIssues}
                onCheckedChange={(checked) => setShowIssues(checked === true)}
              />
              <span className="text-sm">Issues</span>
            </label>
          </div>

          {/* Search Button */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={fetchData} disabled={loading} className="flex-1 sm:flex-none">
              <Search className={`h-4 w-4 mr-2 ${loading ? 'animate-pulse' : ''}`} />
              {loading ? 'Searching...' : 'Search'}
            </Button>
            {hasSearched && filteredActivities.length > 0 && (
              <Button onClick={handleExport} variant="outline" className="flex-1 sm:flex-none" disabled={exporting}>
                <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-pulse' : ''}`} />
                {exporting ? 'Exporting...' : 'Export Picks to Excel'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{totalPickCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Picks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{totalQtyPicked.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Qty Picked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{allUniqueParts}</div>
                <p className="text-xs text-muted-foreground">Unique Parts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{allUniqueUsers}</div>
                <p className="text-xs text-muted-foreground">Users</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{totalIssueCount}</div>
                <p className="text-xs text-muted-foreground">Issues</p>
              </CardContent>
            </Card>
          </div>

          {/* Search Within Results */}
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search within results by name, part number, SO number, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
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
                        <span>{format(new Date(date), 'EEEE, MMMM d, yyyy')}</span>
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
                                  {activity.type === 'pick' ? (activity.picked_by || 'Unknown') : (activity.user || 'Unknown')}
                                </span>
                                {getActivityBadge(activity.type)}
                                {activity.type === 'pick' && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
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
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                <span className="font-mono font-medium">{activity.part_number}</span>
                                {activity.type === 'pick' && activity.description && (
                                  <span className="text-muted-foreground"> - {activity.description}</span>
                                )}
                                {activity.type !== 'pick' && (
                                  <span className="text-muted-foreground"> - {activity.issue_type.replace('_', ' ')}</span>
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
                              {activity.type !== 'pick' && activity.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(activity.type === 'pick' ? activity.picked_at : activity.timestamp), 'h:mm a')}
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
