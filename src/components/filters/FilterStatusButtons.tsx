import { Button } from '@/components/ui/button';
import type { StatusButtonOption } from './types';

interface FilterStatusButtonsProps<T extends string> {
  options: StatusButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function FilterStatusButtons<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterStatusButtonsProps<T>) {
  return (
    <div className={`flex flex-wrap gap-2 ${className || ''}`}>
      {options.map(({ value: optionValue, label, shortLabel, icon: Icon, title }) => (
        <Button
          key={optionValue}
          variant={value === optionValue ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(optionValue)}
          className="flex items-center gap-1.5"
          title={title}
          aria-label={title}
          aria-pressed={value === optionValue}
        >
          {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
          <span className="hidden sm:inline">{label}</span>
          {shortLabel && <span className="sm:hidden">{shortLabel}</span>}
          {!shortLabel && <span className="sm:hidden">{label}</span>}
        </Button>
      ))}
    </div>
  );
}
