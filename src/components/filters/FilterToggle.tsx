import { Badge } from '@/components/ui/badge';

interface FilterToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  badgeCount?: number;
  className?: string;
}

export function FilterToggle({
  label,
  checked,
  onChange,
  badgeCount,
  className,
}: FilterToggleProps) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className={`flex items-center gap-2 cursor-pointer select-none hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors ${className || ''}`}
    >
      <span
        className={`flex items-center justify-center h-5 w-5 shrink-0 rounded border border-primary ${
          checked ? 'bg-primary text-primary-foreground' : ''
        }`}
        aria-hidden="true"
      >
        {checked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          {badgeCount}
        </Badge>
      )}
    </div>
  );
}
