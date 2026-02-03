import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Orders } from '@/pages/Orders';
import { OrderDetail } from '@/pages/OrderDetail';
import { ConsolidatedParts } from '@/pages/ConsolidatedParts';
import { ItemsToOrder } from '@/pages/ItemsToOrder';
import { Import } from '@/pages/Import';
import { Settings } from '@/pages/Settings';
import { Issues } from '@/pages/Issues';
import { PickHistory } from '@/pages/PickHistory';
import { OfflineIndicator, InstallPrompt, UpdatePrompt } from '@/components/pwa';
import { NamePrompt } from '@/components/NamePrompt';
import { PasswordGate } from '@/components/PasswordGate';
import { useTheme } from '@/hooks/useTheme';

function App() {
  // Initialize theme on app mount
  useTheme();

  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/parts" element={<ConsolidatedParts />} />
          <Route path="/items-to-order" element={<ItemsToOrder />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/activity" element={<PickHistory />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MainLayout>

      {/* Password Gate - must authenticate before using app */}
      <PasswordGate />

      {/* Name Prompt - shows when user first visits (after authentication) */}
      <NamePrompt />

      {/* PWA Components */}
      <OfflineIndicator />
      <InstallPrompt />
      <UpdatePrompt />
    </BrowserRouter>
  );
}

export default App;
