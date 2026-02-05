import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MultiSelectOption } from './types';

interface FilterMultiSelectProps {
  label: string;
  icon?: LucideIcon;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  allLabel?: string; // Text when nothing selected, e.g., "All Orders"
  className?: string;
  width?: string; // Tailwind width class, e.g., "w-48"
}

export function FilterMultiSelect({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  allLabel,
  className,
  width = 'w-48',
}: FilterMultiSelectProps) {
  const toggleOption = (value: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onChange(newSelected);
  };

  const selectAll = () => {
    onChange(new Set(options.map(o => o.value)));
  };

  const deselectAll = () => {
    onChange(new Set());
  };

  const displayText = selected.size === 0
    ? (allLabel || `All ${label}`)
    : `${selected.size} ${label}${selected.size !== 1 ? 's' : ''}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`${width} h-9 justify-between font-normal ${className || ''}`}
        >
          <span className="flex items-center gap-2 truncate">
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="truncate">{displayText}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8"
            onClick={selectAll}
          >
            Select All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8"
            onClick={deselectAll}
          >
            Clear
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
            >
              <Checkbox
                checked={selected.has(option.value)}
                onCheckedChange={() => toggleOption(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
