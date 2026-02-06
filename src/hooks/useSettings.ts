import { useState, useEffect } from 'react';
import type { UserSettings } from '@/types';
import { STORAGE_KEYS } from '@/lib/constants';

const defaultSettings: UserSettings = {
  user_name: '',
  theme: 'system',
  isAuthenticated: false,
  tagPrintingEnabled: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        setSettings(defaultSettings);
      }
    }
    setLoaded(true);
  }, []);

  const updateSettings = (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
  };

  const getUserName = (): string => {
    return settings.user_name || 'Anonymous';
  };

  const isAuthenticated = (): boolean => {
    return settings.isAuthenticated === true;
  };

  const authenticate = () => {
    updateSettings({ isAuthenticated: true });
  };

  const isTagPrintingEnabled = (): boolean => {
    return settings.tagPrintingEnabled === true;
  };

  return {
    settings,
    loaded,
    updateSettings,
    getUserName,
    isAuthenticated,
    authenticate,
    isTagPrintingEnabled,
  };
}
