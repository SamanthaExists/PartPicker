import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Register service worker with update handling
const updateSW = registerSW({
  onNeedRefresh() {
    // Dispatch custom event for components to handle
    window.dispatchEvent(
      new CustomEvent('sw-update', {
        detail: { update: updateSW },
      })
    );
  },
  onOfflineReady() {
    // App is ready to work offline
  },
  onRegistered(registration) {
    if (registration) {
      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
  onRegisterError(error) {
    if (import.meta.env.DEV) {
      console.error('Service worker registration failed:', error);
    }
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
