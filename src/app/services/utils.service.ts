import { Injectable } from '@angular/core';
import { format, formatDistanceToNow, parseISO, differenceInDays, isAfter, isBefore, addDays } from 'date-fns';

export type DueDateStatus = 'overdue' | 'due-soon' | 'ok' | 'no-date';

export interface DueDateInfo {
  status: DueDateStatus;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class UtilsService {
  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  }

  formatRelativeTime(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    try {
      return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-primary';
      case 'complete':
        return 'bg-success';
      case 'cancelled':
        return 'bg-secondary';
      case 'pending':
        return 'bg-warning';
      case 'in-progress':
        return 'bg-info';
      default:
        return 'bg-secondary';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'active':
        return 'badge bg-primary';
      case 'complete':
        return 'badge bg-success';
      case 'cancelled':
        return 'badge bg-secondary';
      case 'pending':
        return 'badge bg-warning text-dark';  // text-dark needed for contrast on yellow bg
      case 'in-progress':
        return 'badge bg-info';
      default:
        return 'badge bg-secondary';
    }
  }

  getDueDateStatus(dueDate: string | null | undefined): DueDateInfo {
    if (!dueDate) {
      return { status: 'no-date', label: 'No due date' };
    }

    try {
      const due = parseISO(dueDate);
      const now = new Date();
      const daysUntilDue = differenceInDays(due, now);

      if (isBefore(due, now)) {
        const daysOverdue = Math.abs(daysUntilDue);
        return {
          status: 'overdue',
          label: daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`,
        };
      } else if (daysUntilDue <= 3) {
        if (daysUntilDue === 0) {
          return { status: 'due-soon', label: 'Due today' };
        } else if (daysUntilDue === 1) {
          return { status: 'due-soon', label: 'Due tomorrow' };
        } else {
          return { status: 'due-soon', label: `Due in ${daysUntilDue} days` };
        }
      } else {
        return { status: 'ok', label: `Due in ${daysUntilDue} days` };
      }
    } catch {
      return { status: 'no-date', label: 'Invalid date' };
    }
  }

  getDueDateBadgeClass(status: DueDateStatus): string {
    switch (status) {
      case 'overdue':
        return 'badge border border-danger text-danger';
      case 'due-soon':
        return 'badge border border-warning text-warning';
      case 'ok':
        return 'badge border border-success text-success';
      default:
        return 'badge border border-secondary text-secondary';
    }
  }

  isDueSoon(dueDate: string | null | undefined, daysThreshold: number = 3): boolean {
    if (!dueDate) return false;

    try {
      const due = parseISO(dueDate);
      const now = new Date();
      const threshold = addDays(now, daysThreshold);

      return isBefore(due, threshold);
    } catch {
      return false;
    }
  }

  getIssueTypeLabel(issueType: string): string {
    switch (issueType) {
      case 'out_of_stock':
        return 'Out of Stock';
      case 'wrong_part':
        return 'Wrong Part';
      case 'damaged':
        return 'Damaged';
      case 'inventory_discrepancy':
        return 'Inventory Discrepancy';
      case 'wrong_location':
        return 'Wrong Location';
      case 'other':
        return 'Other';
      default:
        return issueType;
    }
  }

  getIssueTypeBadgeClass(issueType: string): string {
    switch (issueType) {
      case 'out_of_stock':
        return 'badge bg-danger';
      case 'wrong_part':
        return 'badge bg-warning text-dark';
      case 'damaged':
        return 'badge bg-danger';
      case 'inventory_discrepancy':
        return 'badge bg-warning text-dark';
      case 'wrong_location':
        return 'badge bg-info text-dark';
      case 'other':
        return 'badge bg-secondary';
      default:
        return 'badge bg-secondary';
    }
  }

  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  }
}
