import type { LucideIcon } from 'lucide-react';

/**
 * Option for status button filters (e.g., All, Active, Complete)
 */
export interface StatusButtonOption<T extends string = string> {
  value: T;
  label: string;
  shortLabel?: string; // For mobile display
  icon?: LucideIcon;
  title?: string; // Tooltip/aria-label
}

/**
 * Option for multi-select dropdown filters
 */
export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Option for sort dropdowns
 */
export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * Date preset for quick date range selection
 */
export interface DatePreset {
  label: string;
  getValue: () => { start: Date; end: Date };
}

/**
 * Activity type filter option
 */
export interface ActivityTypeOption {
  key: string;
  label: string;
  checked: boolean;
}
