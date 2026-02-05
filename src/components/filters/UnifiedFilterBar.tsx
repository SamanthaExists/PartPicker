import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/common/SearchInput';
import { FilterStatusButtons } from './FilterStatusButtons';
import { FilterMultiSelect } from './FilterMultiSelect';
import { FilterSort } from './FilterSort';
import { FilterToggle } from './FilterToggle';
import type { StatusButtonOption, MultiSelectOption, SortOption } from './types';

// Dropdown configuration for multi-select filters
interface DropdownConfig {
  label: string;
  icon?: LucideIcon;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  allLabel?: string;
  width?: string;
}

// Toggle configuration
interface ToggleConfig {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  badgeCount?: number;
}

// Sort configuration
interface SortConfig<T extends string> {
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
  showIcon?: boolean;
  width?: string;
}

interface UnifiedFilterBarProps<TStatus extends string, TSort extends string> {
  // Search (always shown)
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Use larger search input styling */
  searchLarge?: boolean;

  // Primary Row: Status Buttons (optional)
  statusButtons?: StatusButtonOption<TStatus>[];
  statusValue?: TStatus;
  onStatusChange?: (value: TStatus) => void;
  /** Optional label/icon to show before status buttons */
  statusLabel?: React.ReactNode;

  // Secondary Row: Sort + Dropdowns (optional)
  sort?: SortConfig<TSort>;
  dropdowns?: DropdownConfig[];

  // Toggles Row (optional)
  toggles?: ToggleConfig[];

  // Footer
  resultCount?: number;
  showClearAll?: boolean;
  onClearAll?: () => void;

  // Styling
  variant?: 'default' | 'primary' | 'warning';
  className?: string;
}

const variantStyles = {
  default: '',
  primary: 'border-2 border-primary/20 bg-primary/5',
  warning: 'border-2 border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20',
};

export function UnifiedFilterBar<TStatus extends string, TSort extends string>({
  // Search
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchLarge = false,

  // Status buttons
  statusButtons,
  statusValue,
  onStatusChange,
  statusLabel,

  // Sort & dropdowns
  sort,
  dropdowns,

  // Toggles
  toggles,

  // Footer
  resultCount,
  showClearAll = false,
  onClearAll,

  // Styling
  variant = 'default',
  className,
}: UnifiedFilterBarProps<TStatus, TSort>) {
  const hasStatusRow = statusButtons && statusValue !== undefined && onStatusChange;
  const hasSecondaryRow = sort || (dropdowns && dropdowns.length > 0);
  const hasTogglesRow = toggles && toggles.length > 0;
  const hasFooter = showClearAll || resultCount !== undefined;

  return (
    <Card className={`${variantStyles[variant]} ${className || ''}`}>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          {/* Search Row */}
          <SearchInput
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            large={searchLarge}
          />

          {/* Primary Row: Status Buttons */}
          {hasStatusRow && (
            <div className="flex items-center gap-2 flex-wrap">
              {statusLabel}
              <FilterStatusButtons
                options={statusButtons}
                value={statusValue}
                onChange={onStatusChange}
              />
            </div>
          )}

          {/* Secondary Row: Sort + Dropdowns */}
          {hasSecondaryRow && (
            <div className="flex flex-wrap items-center gap-2">
              {sort && (
                <FilterSort
                  options={sort.options}
                  value={sort.value}
                  onChange={sort.onChange}
                  showIcon={sort.showIcon}
                  width={sort.width}
                />
              )}
              {dropdowns?.map((dropdown, index) => (
                <FilterMultiSelect
                  key={index}
                  label={dropdown.label}
                  icon={dropdown.icon}
                  options={dropdown.options}
                  selected={dropdown.selected}
                  onChange={dropdown.onChange}
                  allLabel={dropdown.allLabel}
                  width={dropdown.width}
                />
              ))}
            </div>
          )}

          {/* Toggles Row */}
          {hasTogglesRow && (
            <div className="flex items-center gap-4 flex-wrap">
              {toggles.map((toggle, index) => (
                <FilterToggle
                  key={index}
                  label={toggle.label}
                  checked={toggle.checked}
                  onChange={toggle.onChange}
                  badgeCount={toggle.badgeCount}
                />
              ))}
            </div>
          )}

          {/* Footer: Clear All + Result Count */}
          {hasFooter && (
            <div className="flex items-center justify-between">
              <div>
                {showClearAll && onClearAll && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    className="h-9 px-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                )}
              </div>
              {resultCount !== undefined && (
                <span className="text-sm text-muted-foreground">
                  {resultCount} result{resultCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
