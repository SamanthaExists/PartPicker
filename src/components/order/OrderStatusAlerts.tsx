import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import type { Order } from '@/types';
import { formatDate, getDueDateStatus } from '@/lib/utils';

interface OrderStatusAlertsProps {
  order: Order;
  showCompletionSuggestion: boolean;
  onMarkComplete: () => void;
  onDismissCompletionSuggestion: () => void;
}

export function OrderStatusAlerts({
  order,
  showCompletionSuggestion,
  onMarkComplete,
  onDismissCompletionSuggestion,
}: OrderStatusAlertsProps) {
  const dueDateInfo = getDueDateStatus(order.due_date);

  return (
    <>
      {/* Completion Suggestion Alert */}
      {showCompletionSuggestion && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">All items picked!</AlertTitle>
          <AlertDescription className="text-green-700">
            This order is 100% picked and ready to be marked complete.
            <div className="mt-2">
              <Button size="sm" onClick={onMarkComplete} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismissCompletionSuggestion}
                className="ml-2 text-green-700 hover:text-green-800"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Completed Order Banner */}
      {order.status === 'complete' && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Order Complete</AlertTitle>
          <AlertDescription className="text-green-700">
            This order has been marked as complete.
          </AlertDescription>
        </Alert>
      )}

      {/* Cancelled Order Banner */}
      {order.status === 'cancelled' && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Order Cancelled</AlertTitle>
          <AlertDescription className="text-red-700">
            This order has been cancelled.
          </AlertDescription>
        </Alert>
      )}

      {/* Overdue Order Banner */}
      {order.status === 'active' && dueDateInfo.status === 'overdue' && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Order Overdue</AlertTitle>
          <AlertDescription className="text-red-700">
            This order was due on {formatDate(order.due_date)} and is now {dueDateInfo.label.toLowerCase()}.
          </AlertDescription>
        </Alert>
      )}

      {/* Due Soon Banner */}
      {order.status === 'active' && dueDateInfo.status === 'due-soon' && (
        <Alert className="border-amber-200 bg-amber-50">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Order Due Soon</AlertTitle>
          <AlertDescription className="text-amber-700">
            {dueDateInfo.label} ({formatDate(order.due_date)}).
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
