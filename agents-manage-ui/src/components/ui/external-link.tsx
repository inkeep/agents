import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, FC } from 'react';
import { cn } from '@/lib/utils';

export const ExternalLink: FC<ComponentProps<typeof Link> & { iconClassName?: string }> = ({
  href,
  children,
  className,
  iconClassName,
  ...props
}) => {
  'use memo';

  return (
    <Link
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
          'size-3.5 text-muted-foreground opacity-60 group-hover/link:text-primary inline',
          iconClassName
        )}
      />
    </Link>
  );
};
