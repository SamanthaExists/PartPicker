import { ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SortOption } from './types';

interface FilterSortProps<T extends string> {
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
  showIcon?: boolean;
  className?: string;
  width?: string; // Tailwind width class, e.g., "w-48"
}

export function FilterSort<T extends string>({
  options,
  value,
  onChange,
  showIcon = true,
  className,
  width = 'w-48',
}: FilterSortProps<T>) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      {showIcon && <ArrowUpDown className="h-4 w-4 text-muted-foreground" />}
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className={width}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
