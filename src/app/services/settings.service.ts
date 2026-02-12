import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UserSettings } from '../models';

const SETTINGS_KEY = 'pick-list-settings';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private settingsSubject = new BehaviorSubject<UserSettings>(this.loadSettings());

  settings$ = this.settingsSubject.asObservable();

  private loadSettings(): UserSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    return {
      user_name: '',
      theme: 'system',
    };
  }

  private saveSettings(settings: UserSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      this.settingsSubject.next(settings);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  getSettings(): UserSettings {
    return this.settingsSubject.getValue();
  }

  getUserName(): string {
    return this.settingsSubject.getValue().user_name;
  }

  setUserName(name: string): void {
    const settings = this.getSettings();
    this.saveSettings({ ...settings, user_name: name });
  }

  getTheme(): 'light' | 'dark' | 'system' {
    return this.settingsSubject.getValue().theme;
  }

  setTheme(theme: 'light' | 'dark' | 'system'): void {
    const settings = this.getSettings();
    this.saveSettings({ ...settings, theme });
    this.applyTheme(theme);
  }

  applyTheme(theme: 'light' | 'dark' | 'system'): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

    document.documentElement.setAttribute('data-bs-theme', effectiveTheme);
  }

  initializeTheme(): void {
    this.applyTheme(this.getTheme());

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.getTheme() === 'system') {
        this.applyTheme('system');
      }
    });
  }

  isTagPrintingEnabled(): boolean {
    return this.settingsSubject.getValue().tagPrintingEnabled === true;
  }

  setTagPrintingEnabled(enabled: boolean): void {
    const settings = this.getSettings();
    this.saveSettings({ ...settings, tagPrintingEnabled: enabled });
  }

  isAuthenticated(): boolean {
    return this.settingsSubject.getValue().isAuthenticated === true;
  }

  authenticate(): void {
    const settings = this.getSettings();
    this.saveSettings({ ...settings, isAuthenticated: true });
  }
}
