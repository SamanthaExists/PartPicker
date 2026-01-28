import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseISO, isBefore, startOfDay, differenceInDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Due date status types
export type DueDateStatus = 'overdue' | 'due-soon' | 'on-track' | 'no-date';

export interface DueDateInfo {
  status: DueDateStatus;
  daysUntilDue: number | null;
  label: string;
}

/**
 * Get the due date status for an order
 * @param dueDate - The due date string (ISO format) or null
 * @param dueSoonDays - Number of days to consider "due soon" (default: 3)
 * @returns DueDateInfo object with status, days until due, and label
 */
export function getDueDateStatus(dueDate: string | null | undefined, dueSoonDays: number = 3): DueDateInfo {
  if (!dueDate) {
    return { status: 'no-date', daysUntilDue: null, label: 'No due date' };
  }

  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(dueDate));
  const daysUntilDue = differenceInDays(due, today);

  if (isBefore(due, today)) {
    return {
      status: 'overdue',
      daysUntilDue,
      label: daysUntilDue === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(daysUntilDue)} days`
    };
  }

  if (daysUntilDue === 0) {
    return { status: 'due-soon', daysUntilDue: 0, label: 'Due today' };
  }

  if (daysUntilDue <= dueSoonDays) {
    return {
      status: 'due-soon',
      daysUntilDue,
      label: daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue} days`
    };
  }

  return {
    status: 'on-track',
    daysUntilDue,
    label: `Due in ${daysUntilDue} days`
  };
}

/**
 * Get CSS classes for due date status styling
 * @param status - The due date status
 * @returns Object with background, text, and border classes
 */
export function getDueDateColors(status: DueDateStatus): { bg: string; text: string; border: string; badge: string } {
  switch (status) {
    case 'overdue':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-800 border-red-300'
      };
    case 'due-soon':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        badge: 'bg-amber-100 text-amber-800 border-amber-300'
      };
    case 'on-track':
      return {
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-green-200',
        badge: 'bg-green-100 text-green-800 border-green-300'
      };
    case 'no-date':
    default:
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        border: 'border-gray-200',
        badge: 'bg-gray-100 text-gray-700 border-gray-300'
      };
  }
}

/**
 * Check if an order is overdue
 */
export function isOverdue(dueDate: string | null | undefined): boolean {
  return getDueDateStatus(dueDate).status === 'overdue';
}

/**
 * Check if an order is due soon (within specified days)
 */
export function isDueSoon(dueDate: string | null | undefined, days: number = 3): boolean {
  const status = getDueDateStatus(dueDate, days);
  return status.status === 'due-soon' || status.status === 'overdue';
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function calculateProgress(picked: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((picked / total) * 100);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'complete':
      return 'bg-green-100 text-green-800';
    case 'in-progress':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
      return 'bg-gray-100 text-gray-800';
    case 'active':
      return 'bg-blue-100 text-blue-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Extract location prefix (e.g., "A-01" -> "A", "B-02-03" -> "B-02")
 * Used for grouping items by location area
 */
export function getLocationPrefix(location: string | null | undefined): string {
  if (!location) return '';
  const parts = location.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return parts[0] || '';
}

/**
 * Alphanumeric sort comparison that handles mixed numeric/string values naturally
 * e.g., "A-2" comes before "A-10"
 */
export function alphanumericCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
