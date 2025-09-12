import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function ExternalLink({ href, children, className, ...props }: ComponentProps<typeof Link>) {
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
      <ArrowUpRight className="size-3.5 text-muted-foreground/60 group-hover/link:text-primary" />
    </Link>
  );
}
