import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PartIssue, PartIssueType } from '@/types';
import { getPartIssueTypeLabel, getPartIssueTypeColor } from '@/hooks/usePartIssues';

const ISSUE_TYPES: PartIssueType[] = ['inventory_discrepancy', 'wrong_location', 'damaged', 'other'];

interface ReportPartIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string | null;
  partDescription?: string | null;
  partLocation?: string | null;
  existingIssue?: PartIssue | null;
  onSubmit: (
    partNumber: string,
    issueType: PartIssueType,
    description?: string
  ) => Promise<boolean>;
  onResolve?: (issueId: string) => Promise<boolean>;
}

export function ReportPartIssueDialog({
  open,
  onOpenChange,
  partNumber,
  partDescription,
  partLocation,
  existingIssue,
  onSubmit,
  onResolve,
}: ReportPartIssueDialogProps) {
  const [issueType, setIssueType] = useState<PartIssueType | ''>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [showNewIssueForm, setShowNewIssueForm] = useState(false);

  const handleSubmit = async () => {
    if (!partNumber || !issueType) return;

    setIsSubmitting(true);
    const success = await onSubmit(
      partNumber,
      issueType,
      description.trim() || undefined
    );

    if (success) {
      handleClose();
    }
    setIsSubmitting(false);
  };

  const handleResolve = async () => {
    if (!existingIssue || !onResolve) return;

    setIsResolving(true);
    const success = await onResolve(existingIssue.id);
    if (success) {
      handleClose();
    }
    setIsResolving(false);
  };

  const handleClose = () => {
    setIssueType('');
    setDescription('');
    setShowNewIssueForm(false);
    onOpenChange(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const hasExistingIssue = existingIssue && existingIssue.status === 'open';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {hasExistingIssue ? 'Part Issue' : 'Report Part Issue'}
          </DialogTitle>
          <DialogDescription>
            {hasExistingIssue
              ? 'View or resolve the current issue for this part'
              : 'Report a problem with this part (e.g., inventory discrepancy)'
            }
          </DialogDescription>
        </DialogHeader>

        {partNumber && (
          <div className="space-y-4 py-4">
            {/* Part info */}
            <div className="rounded-lg bg-muted p-3">
              <p className="font-mono font-medium">{partNumber}</p>
              {partDescription && (
                <p className="text-sm text-muted-foreground mt-1">
                  {partDescription}
                </p>
              )}
              {partLocation && (
                <p className="text-sm text-muted-foreground">
                  Location: {partLocation}
                </p>
              )}
            </div>

            {/* Existing Issue */}
            {hasExistingIssue && !showNewIssueForm && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className={getPartIssueTypeColor(existingIssue.issue_type)}>
                    {getPartIssueTypeLabel(existingIssue.issue_type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(existingIssue.created_at)}
                  </span>
                </div>

                {existingIssue.description && (
                  <p className="text-sm">{existingIssue.description}</p>
                )}

                {existingIssue.reported_by && (
                  <p className="text-xs text-muted-foreground">
                    Reported by: {existingIssue.reported_by}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={handleResolve}
                    disabled={isResolving}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {isResolving ? 'Resolving...' : 'Mark as Resolved'}
                  </Button>
                </div>
              </div>
            )}

            {/* Add another issue button */}
            {hasExistingIssue && !showNewIssueForm && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowNewIssueForm(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Report Another Issue
              </Button>
            )}

            {/* New Issue Form */}
            {(!hasExistingIssue || showNewIssueForm) && (
              <>
                {showNewIssueForm && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3">Report New Issue</p>
                  </div>
                )}

                {/* Issue type */}
                <div className="space-y-2">
                  <Label htmlFor="issueType">Issue Type *</Label>
                  <Select
                    value={issueType}
                    onValueChange={(value) => setIssueType(value as PartIssueType)}
                  >
                    <SelectTrigger id="issueType">
                      <SelectValue placeholder="Select issue type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getPartIssueTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="E.g., 'System shows 5 in stock but shelf is empty'"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {showNewIssueForm && (
            <Button variant="ghost" onClick={() => setShowNewIssueForm(false)}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            {hasExistingIssue && !showNewIssueForm ? 'Close' : 'Cancel'}
          </Button>
          {(!hasExistingIssue || showNewIssueForm) && (
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={!issueType || isSubmitting}
            >
              {isSubmitting ? 'Reporting...' : 'Report Issue'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
