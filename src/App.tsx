import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageErrorBoundary } from '@/components/ErrorBoundary';
import { InstallPrompt } from '@/components/pwa';
import { NamePrompt } from '@/components/NamePrompt';
import { PasswordGate } from '@/components/PasswordGate';
import { useTheme } from '@/hooks/useTheme';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Orders = lazy(() => import('@/pages/Orders').then(m => ({ default: m.Orders })));
const OrderDetail = lazy(() => import('@/pages/OrderDetail').then(m => ({ default: m.OrderDetail })));
const ConsolidatedParts = lazy(() => import('@/pages/ConsolidatedParts').then(m => ({ default: m.ConsolidatedParts })));
const ItemsToOrder = lazy(() => import('@/pages/ItemsToOrder').then(m => ({ default: m.ItemsToOrder })));
const Import = lazy(() => import('@/pages/Import').then(m => ({ default: m.Import })));
const Templates = lazy(() => import('@/pages/Templates').then(m => ({ default: m.Templates })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Issues = lazy(() => import('@/pages/Issues').then(m => ({ default: m.Issues })));
const PickHistory = lazy(() => import('@/pages/PickHistory').then(m => ({ default: m.PickHistory })));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function App() {
  // Initialize theme on app mount
  useTheme();

  return (
    <BrowserRouter>
      <MainLayout>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/" element={<PageErrorBoundary><Dashboard /></PageErrorBoundary>} />
            <Route path="/orders" element={<PageErrorBoundary><Orders /></PageErrorBoundary>} />
            <Route path="/orders/:id" element={<PageErrorBoundary><OrderDetail /></PageErrorBoundary>} />
            <Route path="/parts" element={<PageErrorBoundary><ConsolidatedParts /></PageErrorBoundary>} />
            <Route path="/items-to-order" element={<PageErrorBoundary><ItemsToOrder /></PageErrorBoundary>} />
            <Route path="/issues" element={<PageErrorBoundary><Issues /></PageErrorBoundary>} />
            <Route path="/activity" element={<PageErrorBoundary><PickHistory /></PageErrorBoundary>} />
            <Route path="/templates" element={<PageErrorBoundary><Templates /></PageErrorBoundary>} />
            <Route path="/import" element={<PageErrorBoundary><Import /></PageErrorBoundary>} />
            <Route path="/settings" element={<PageErrorBoundary><Settings /></PageErrorBoundary>} />
          </Routes>
        </Suspense>
      </MainLayout>

      {/* Password Gate - must authenticate before using app */}
      <PasswordGate />

      {/* Name Prompt - shows when user first visits (after authentication) */}
      <NamePrompt />

      {/* PWA Components */}
      <InstallPrompt />
    </BrowserRouter>
  );
}

export default App;
