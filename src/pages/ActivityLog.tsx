import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';
import {
  History,
  RefreshCw,
  Search,
  User,
  Package,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'pick' | 'issue_created' | 'issue_resolved';
  action: string;
  details: string;
  user: string;
  timestamp: string;
  order_id?: string;
  so_number?: string;
  part_number?: string;
  qty?: number;
}

const PAGE_SIZE = 50;

export function ActivityLog() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch picks with related data
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
            order_id,
            orders!inner (
              so_number
            )
          )
        `, { count: 'exact' })
        .order('picked_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (picksError) {
        console.error('Error fetching picks:', picksError);
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
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (issuesError) {
        console.error('Error fetching issues:', issuesError);
      }

      // Combine and format activities
      const allActivities: ActivityItem[] = [];

      // Add picks
      if (picksData) {
        for (const pick of picksData as any[]) {
          allActivities.push({
            id: `pick-${pick.id}`,
            type: 'pick',
            action: 'Picked parts',
            details: `${pick.qty_picked}x ${pick.line_items.part_number}`,
            user: pick.picked_by || 'Unknown',
            timestamp: pick.picked_at,
            order_id: pick.line_items.order_id,
            so_number: pick.line_items.orders.so_number,
            part_number: pick.line_items.part_number,
            qty: pick.qty_picked,
          });
        }
      }

      // Add issues (only on first page to avoid duplicates)
      if (page === 0 && issuesData) {
        for (const issue of issuesData as any[]) {
          // Issue created
          allActivities.push({
            id: `issue-created-${issue.id}`,
            type: 'issue_created',
            action: `Reported ${issue.issue_type.replace('_', ' ')}`,
            details: `${issue.line_items.part_number}${issue.description ? `: ${issue.description}` : ''}`,
            user: issue.reported_by || 'Unknown',
            timestamp: issue.created_at,
            order_id: issue.line_items.order_id,
            so_number: issue.line_items.orders.so_number,
            part_number: issue.line_items.part_number,
          });

          // Issue resolved
          if (issue.status === 'resolved' && issue.resolved_at) {
            allActivities.push({
              id: `issue-resolved-${issue.id}`,
              type: 'issue_resolved',
              action: 'Resolved issue',
              details: `${issue.line_items.part_number} - ${issue.issue_type.replace('_', ' ')}`,
              user: issue.resolved_by || 'Unknown',
              timestamp: issue.resolved_at,
              order_id: issue.line_items.order_id,
              so_number: issue.line_items.orders.so_number,
              part_number: issue.line_items.part_number,
            });
          }
        }
      }

      // Sort by timestamp descending
      allActivities.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setActivities(allActivities);
      setTotalCount(picksCount || 0);
      setHasMore((picksData?.length || 0) === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Filter activities by search query
  const filteredActivities = activities.filter(activity => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.user.toLowerCase().includes(query) ||
      activity.details.toLowerCase().includes(query) ||
      activity.action.toLowerCase().includes(query) ||
      (activity.so_number && activity.so_number.toLowerCase().includes(query)) ||
      (activity.part_number && activity.part_number.toLowerCase().includes(query))
    );
  });

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const date = format(new Date(activity.timestamp), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, ActivityItem[]>);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'pick':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'issue_created':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'issue_resolved':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Package className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityBadge = (type: ActivityItem['type']) => {
    switch (type) {
      case 'pick':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Pick</Badge>;
      case 'issue_created':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Issue</Badge>;
      case 'issue_resolved':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Resolved</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8" />
            Activity Log
          </h1>
          <p className="text-muted-foreground">
            Track who did what and when
          </p>
        </div>
        <Button onClick={fetchActivities} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, part number, or SO number..."
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
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            {totalCount > 0 ? `${totalCount.toLocaleString()} total records` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && activities.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'No activities match your search' : 'No activity recorded yet'}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedActivities).map(([date, dayActivities]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background py-1">
                    {format(new Date(date), 'EEEE, MMMM d, yyyy')}
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
                              {activity.user}
                            </span>
                            {getActivityBadge(activity.type)}
                            {activity.so_number && (
                              <Link
                                to={`/orders/${activity.order_id}`}
                                className="text-sm text-primary hover:underline"
                              >
                                SO-{activity.so_number}
                              </Link>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {activity.action}: <span className="font-mono">{activity.details}</span>
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(activity.timestamp), 'h:mm a')}
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
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
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
    </div>
  );
}
