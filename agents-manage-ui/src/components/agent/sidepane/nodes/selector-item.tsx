import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface SelectorItemProps {
  id: string;
  name: string;
  description?: string | null;
  icon: ReactNode;
  badges?: ReactNode;
  subtitle?: string;
  onClick: () => void;
}

export function SelectorItem({
  id,
  name,
  description,
  icon,
  badges,
  subtitle,
  onClick,
}: SelectorItemProps) {
  return (
    <Button
      variant="unstyled"
      size="unstyled"
      type="button"
      key={id}
      className="w-full p-3 rounded-lg border cursor-pointer transition-colors border-border hover:bg-muted/50 text-left inline-block"
      id={id}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0 truncate">
            <span className="font-medium text-sm truncate">{name}</span>
            {badges}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground truncate font-normal">{description}</p>
          )}
          {subtitle && <p className="text-xs text-muted-foreground/70 truncate">{subtitle}</p>}
        </div>
      </div>
    </Button>
  );
}

interface SelectorItemIconProps {
  children: ReactNode;
}

export function SelectorItemIcon({ children }: SelectorItemIconProps) {
  return (
    <div className="shrink-0 mt-0.5 size-8 rounded bg-muted flex items-center justify-center">
      {children}
    </div>
  );
}
