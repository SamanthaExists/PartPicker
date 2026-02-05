import { Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DatePreset } from './types';

interface FilterDateRangeProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onSearch: () => void;
  presets?: DatePreset[];
  onPresetSelect?: (preset: DatePreset) => void;
  loading?: boolean;
  className?: string;
}

export function FilterDateRange({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSearch,
  presets,
  onPresetSelect,
  loading = false,
  className,
}: FilterDateRangeProps) {
  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Quick Presets */}
      {presets && presets.length > 0 && onPresetSelect && (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => onPresetSelect(preset)}
              className="text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {/* Custom Date/Time Range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="filter-start-date" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Start Date & Time
          </Label>
          <Input
            id="filter-start-date"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-end-date" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            End Date & Time
          </Label>
          <Input
            id="filter-end-date"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      {/* Search Button */}
      <Button onClick={onSearch} disabled={loading}>
        <Search className={`h-4 w-4 mr-2 ${loading ? 'animate-pulse' : ''}`} />
        {loading ? 'Searching...' : 'Search'}
      </Button>
    </div>
  );
}
