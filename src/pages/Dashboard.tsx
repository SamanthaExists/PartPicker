import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Package,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  ShoppingCart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useOrders } from '@/hooks/useOrders';
import { useRecentActivity } from '@/hooks/usePicks';
import { useConsolidatedParts } from '@/hooks/useConsolidatedParts';
import { useItemsToOrder } from '@/hooks/useItemsToOrder';
import { formatDateTime, formatDate, getDueDateStatus, getDueDateColors, isDueSoon, cn } from '@/lib/utils';
import { parseISO } from 'date-fns';

export function Dashboard() {
  const { orders, loading: ordersLoading } = useOrders();
  const { activities, loading: activityLoading } = useRecentActivity();
  const { parts } = useConsolidatedParts();
  const { items: itemsToOrder, loading: itemsToOrderLoading } = useItemsToOrder();

  const activeOrders = orders.filter((o) => o.status === 'active');
  const completedOrders = orders.filter((o) => o.status === 'complete');

  // Get orders that are due soon or overdue (within 3 days)
  const dueSoonOrders = useMemo(() => {
    return activeOrders
      .filter((order) => isDueSoon(order.due_date, 3))
      .sort((a, b) => {
        // Sort by due date (earliest first), null dates go to end
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
      });
  }, [activeOrders]);

  const overdueCount = dueSoonOrders.filter(o => getDueDateStatus(o.due_date).status === 'overdue').length;

  const totalParts = parts.reduce((sum, p) => sum + p.total_needed, 0);
  const pickedParts = parts.reduce((sum, p) => sum + p.total_picked, 0);
  const remainingParts = totalParts - pickedParts;

  const stats = [
    {
      title: 'Active Orders',
      value: activeOrders.length,
      icon: ClipboardList,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Parts Remaining',
      value: remainingParts,
      icon: Package,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      title: 'Parts Picked',
      value: pickedParts,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Completed Orders',
      value: completedOrders.length,
      icon: Clock,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your pick list progress
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-full p-2 ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {ordersLoading ? '...' : stat.value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Due Soon Section - Only show if there are orders due soon */}
      {!ordersLoading && dueSoonOrders.length > 0 && (
        <Card className={cn(
          "border-l-4",
          overdueCount > 0 ? "border-l-red-500 bg-red-50/50 dark:bg-red-950/20" : "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              {overdueCount > 0 ? (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              )}
              <CardTitle className={overdueCount > 0 ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}>
                {overdueCount > 0
                  ? `${overdueCount} Overdue Order${overdueCount > 1 ? 's' : ''}`
                  : `${dueSoonOrders.length} Order${dueSoonOrders.length > 1 ? 's' : ''} Due Soon`
                }
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders?sort=due-date">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dueSoonOrders.slice(0, 5).map((order) => {
                const dueDateInfo = getDueDateStatus(order.due_date);
                const dueDateColors = getDueDateColors(dueDateInfo.status);

                return (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="block"
                  >
                    <div className={cn(
                      "flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors",
                      dueDateInfo.status === 'overdue' && "border-red-200 bg-white dark:border-red-800 dark:bg-red-950/20",
                      dueDateInfo.status === 'due-soon' && "border-amber-200 bg-white dark:border-amber-800 dark:bg-amber-950/20"
                    )}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">SO-{order.so_number}</p>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", dueDateColors.badge)}
                          >
                            {dueDateInfo.status === 'overdue' && <AlertCircle className="h-3 w-3 mr-1" />}
                            {dueDateInfo.status === 'due-soon' && <Clock className="h-3 w-3 mr-1" />}
                            {dueDateInfo.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {order.customer_name || order.tool_model || `${order.tools.length} tool(s)`}
                          {order.due_date && ` - Due: ${formatDate(order.due_date)}`}
                        </p>
                      </div>
                      <div className="w-20 sm:w-24 ml-3 sm:ml-4 flex-shrink-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{order.progress_percent}%</span>
                        </div>
                        <Progress value={order.progress_percent} className="h-2" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items to Order Section - Only show if there are items */}
      {!itemsToOrderLoading && itemsToOrder.length > 0 && (
        <Card className="border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-orange-800 dark:text-orange-300">
                {itemsToOrder.length} Part{itemsToOrder.length > 1 ? 's' : ''} to Order
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/items-to-order">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Parts with no stock available that still need to be picked
            </p>
            <div className="space-y-2">
              {itemsToOrder.slice(0, 5).map((item) => (
                <div
                  key={item.part_number}
                  className="flex items-center justify-between rounded-lg border border-orange-200 bg-white dark:border-orange-800 dark:bg-orange-950/20 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium truncate">{item.part_number}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <Badge variant="outline" className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                      {item.remaining} needed
                    </Badge>
                  </div>
                </div>
              ))}
              {itemsToOrder.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{itemsToOrder.length - 5} more items
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : activeOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No active orders</p>
                <Button asChild className="mt-4">
                  <Link to="/import">Import an Order</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeOrders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors">
                      <div>
                        <p className="font-medium">SO-{order.so_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.tools.length} tool(s)
                        </p>
                      </div>
                      <div className="w-24 sm:w-32 flex-shrink-0">
                        <div className="flex justify-between text-xs sm:text-sm mb-1">
                          <span>{order.progress_percent}%</span>
                          <span className="text-muted-foreground">
                            {order.picked_items}/{order.total_items}
                          </span>
                        </div>
                        <Progress value={order.progress_percent} className="h-2" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : activities.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 8).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="mt-1">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p>{activity.message}</p>
                      <p className="text-muted-foreground">
                        {activity.user} - SO-{activity.so_number}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(activity.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
