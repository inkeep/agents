import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeadingProps {
  heading: string;
  Icon?: LucideIcon;
  className?: string;
}

export function Heading({ heading, Icon, className }: HeadingProps) {
  return (
    <div className={cn('text-sm font-medium flex items-center gap-2', className)}>
      {Icon && <Icon className="size-4 text-muted-foreground" />}
      {heading}
    </div>
  );
}
