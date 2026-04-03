import { ArrowUpRight } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { cn } from '@/lib/utils';

export const ExternalLink: FC<ComponentProps<'a'> & { iconClassName?: string }> = ({
  href,
  children,
  className,
  iconClassName,
  ...props
}) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'text-sm text-muted-foreground underline underline-offset-2 inline-flex items-center gap-1 hover:text-primary ml-1 group/link font-mono uppercase transition-colors',
        className
      )}
      {...props}
    >
      {children}
      <ArrowUpRight
        className={cn(
          'shrink-0 size-3.5 text-muted-foreground opacity-60 group-hover/link:text-primary inline',
          iconClassName
        )}
      />
    </a>
  );
};
