import { Badge } from '@/components/ui/badge';
import { Package, Wrench, Box, Pencil } from 'lucide-react';
import type { ClassificationType } from '@/types';
import { cn } from '@/lib/utils';

interface ClassificationBadgeProps {
  classification: ClassificationType | null;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const CLASSIFICATION_CONFIG: Record<ClassificationType, { label: string; icon: typeof Package; className: string }> = {
  purchased: {
    label: 'Purchased',
    icon: Package,
    className: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200',
  },
  manufactured: {
    label: 'Manufactured',
    icon: Wrench,
    className: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900 dark:text-orange-200',
  },
  assembly: {
    label: 'Assembly',
    icon: Box,
    className: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200',
  },
  modified: {
    label: 'Modified',
    icon: Pencil,
    className: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200',
  },
};

export function ClassificationBadge({
  classification,
  className,
  showIcon = true,
  size = 'sm',
}: ClassificationBadgeProps) {
  if (!classification) return null;

  const config = CLASSIFICATION_CONFIG[classification];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <Badge
      variant="outline"
      className={cn(config.className, textSize, className)}
    >
      {showIcon && <Icon className={cn(iconSize, 'mr-1')} />}
      {config.label}
    </Badge>
  );
}
