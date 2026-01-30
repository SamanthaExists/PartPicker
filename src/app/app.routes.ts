import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'orders',
    loadComponent: () => import('./pages/orders/orders.component').then(m => m.OrdersComponent)
  },
  {
    path: 'orders/:id',
    loadComponent: () => import('./pages/order-detail/order-detail.component').then(m => m.OrderDetailComponent)
  },
  {
    path: 'parts',
    loadComponent: () => import('./pages/consolidated-parts/consolidated-parts.component').then(m => m.ConsolidatedPartsComponent)
  },
  {
    path: 'items-to-order',
    loadComponent: () => import('./pages/items-to-order/items-to-order.component').then(m => m.ItemsToOrderComponent)
  },
  {
    path: 'issues',
    loadComponent: () => import('./pages/issues/issues.component').then(m => m.IssuesComponent)
  },
  {
    path: 'import',
    loadComponent: () => import('./pages/import/import.component').then(m => m.ImportComponent)
  },
  {
    path: 'activity',
    loadComponent: () => import('./pages/activity-log/activity-log.component').then(m => m.ActivityLogComponent)
  },
  {
    path: 'pick-history',
    loadComponent: () => import('./pages/pick-history/pick-history.component').then(m => m.PickHistoryComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
