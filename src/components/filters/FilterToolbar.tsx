import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface FilterToolbarProps {
  children: React.ReactNode;
  showClearAll?: boolean;
  onClearAll?: () => void;
  resultCount?: number;
  className?: string;
  /** Card styling variant */
  variant?: 'default' | 'primary' | 'warning';
}

const variantStyles = {
  default: '',
  primary: 'border-2 border-primary/20 bg-primary/5',
  warning: 'border-2 border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20',
};

export function FilterToolbar({
  children,
  showClearAll = false,
  onClearAll,
  resultCount,
  className,
  variant = 'default',
}: FilterToolbarProps) {
  return (
    <Card className={`${variantStyles[variant]} ${className || ''}`}>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          {children}

          {/* Result count and clear all row */}
          {(showClearAll || resultCount !== undefined) && (
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
