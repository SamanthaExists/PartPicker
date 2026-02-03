import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  RefreshCw,
  ExternalLink,
  User,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAllIssues, getIssueTypeLabel, getIssueTypeColor } from '@/hooks/useIssues';
import { useSettings } from '@/hooks/useSettings';
import type { IssueWithDetails, IssueType } from '@/types';
import { cn } from '@/lib/utils';

type FilterStatus = 'all' | 'open' | 'resolved';
type FilterType = 'all' | IssueType;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Issues() {
  const { issues, loading, error, refresh, resolveIssue, reopenIssue } = useAllIssues();
  const { getUserName } = useSettings();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('open');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [resolveConfirm, setResolveConfirm] = useState<IssueWithDetails | null>(null);
  const [reopenConfirm, setReopenConfirm] = useState<IssueWithDetails | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter issues
  const filteredIssues = issues.filter((issue) => {
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
    if (typeFilter !== 'all' && issue.issue_type !== typeFilter) return false;
    return true;
  });

  // Count by status
  const openCount = issues.filter((i) => i.status === 'open').length;
  const resolvedCount = issues.filter((i) => i.status === 'resolved').length;

  const handleResolve = async () => {
    if (!resolveConfirm) return;
    setIsProcessing(true);
    await resolveIssue(resolveConfirm.id, getUserName());
    setResolveConfirm(null);
    setIsProcessing(false);
  };

  const handleReopen = async () => {
    if (!reopenConfirm) return;
    setIsProcessing(true);
    await reopenIssue(reopenConfirm.id);
    setReopenConfirm(null);
    setIsProcessing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={refresh}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Issues</h1>
          <p className="text-muted-foreground">
            Track and resolve reported problems with parts
          </p>
        </div>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{resolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issues.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as FilterType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            <SelectItem value="wrong_part">Wrong Part</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No issues found</p>
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'open'
                ? 'No open issues to resolve'
                : 'No issues match your filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => (
            <Card
              key={issue.id}
              className={cn(
                issue.status === 'resolved' && 'opacity-60'
              )}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* Part and Order Info */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-medium text-lg">
                        {issue.line_item?.part_number || 'Unknown Part'}
                      </span>
                      <Badge className={cn(getIssueTypeColor(issue.issue_type))}>
                        {getIssueTypeLabel(issue.issue_type)}
                      </Badge>
                      <Badge variant={issue.status === 'open' ? 'destructive' : 'success'}>
                        {issue.status === 'open' ? 'Open' : 'Resolved'}
                      </Badge>
                    </div>

                    {/* Description */}
                    {issue.line_item?.description && (
                      <p className="text-sm text-muted-foreground">
                        {issue.line_item.description}
                      </p>
                    )}

                    {/* Issue description */}
                    {issue.description && (
                      <p className="text-sm bg-muted rounded px-3 py-2">
                        {issue.description}
                      </p>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {issue.order && (
                        <Link
                          to={`/orders/${issue.order_id}`}
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                          SO# {issue.order.so_number}
                        </Link>
                      )}
                      {issue.reported_by && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {issue.reported_by}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(issue.created_at)}
                      </span>
                      {issue.status === 'resolved' && issue.resolved_at && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" />
                          Resolved {formatDate(issue.resolved_at)}
                          {issue.resolved_by && ` by ${issue.resolved_by}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {issue.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => setResolveConfirm(issue)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReopenConfirm(issue)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Resolve Confirmation Dialog */}
      <Dialog open={resolveConfirm !== null} onOpenChange={(open) => !open && setResolveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Issue</DialogTitle>
            <DialogDescription>
              Mark this issue as resolved
            </DialogDescription>
          </DialogHeader>
          {resolveConfirm && (
            <div className="py-4">
              <p className="font-mono font-medium">{resolveConfirm.line_item?.part_number}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {getIssueTypeLabel(resolveConfirm.issue_type)}
              </p>
              {resolveConfirm.description && (
                <p className="text-sm bg-muted rounded px-3 py-2 mt-2">
                  {resolveConfirm.description}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveConfirm(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={handleResolve} disabled={isProcessing}>
              {isProcessing ? 'Resolving...' : 'Resolve Issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Confirmation Dialog */}
      <Dialog open={reopenConfirm !== null} onOpenChange={(open) => !open && setReopenConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Issue</DialogTitle>
            <DialogDescription>
              Mark this issue as open again
            </DialogDescription>
          </DialogHeader>
          {reopenConfirm && (
            <div className="py-4">
              <p className="font-mono font-medium">{reopenConfirm.line_item?.part_number}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {getIssueTypeLabel(reopenConfirm.issue_type)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReopen} disabled={isProcessing}>
              {isProcessing ? 'Reopening...' : 'Reopen Issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
