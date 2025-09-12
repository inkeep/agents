import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Base wrapper that provides consistent card styling
export function ItemCardRoot({ className, children, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        'group h-full border-1 shadow-none bg-background hover:ring-2 hover:ring-accent/50 dark:hover:ring-accent/30 transition-all duration-300 py-5 gap-0 rounded-lg linkbox',
        className
      )}
      data-slot="linkbox"
      {...props}
    >
      {children}
    </Card>
  );
}

// Flexible header component
export function ItemCardHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader
      className={cn('px-5 flex items-center justify-between gap-2', className)}
      {...props}
    >
      {children}
    </CardHeader>
  );
}

// Title component with default styling
export function ItemCardTitle({ className, children, ...props }: ComponentProps<typeof CardTitle>) {
  return (
    <CardTitle
      className={cn('font-medium line-clamp-1 leading-tight transition-colors flex-1', className)}
      {...props}
    >
      {children}
    </CardTitle>
  );
}

// Content wrapper with consistent padding and layout
export function ItemCardContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CardContent>) {
  return (
    <CardContent
      className={cn('px-5 gap-4 pt-4 flex flex-col flex-1 justify-between min-w-0', className)}
      {...props}
    >
      {children}
    </CardContent>
  );
}

// Description component with default styling
export function ItemCardDescription({
  className,
  children,
  hasContent = true,
  ...props
}: ComponentProps<typeof CardDescription> & { hasContent?: boolean }) {
  return (
    <CardDescription
      className={cn(
        hasContent ? 'text-muted-foreground' : 'text-muted-foreground/60',
        'text-sm',
        className
      )}
      {...props}
    >
      {children}
    </CardDescription>
  );
}

// Footer with creation date and hover arrow
export function ItemCardFooter({ footerText }: { footerText: string }) {
  return (
    <div className="relative flex items-center justify-between">
      <div className="flex items-center text-xs text-muted-foreground">{footerText}</div>
      <div className="opacity-0 group-hover:opacity-60 transform translate-x-1 group-hover:translate-x-0 transition-all duration-300">
        <ArrowRight className="w-4 h-4 text-muted-foreground/60" />
      </div>
    </div>
  );
}

// Link wrapper with hover effects
export function ItemCardLink({ href, className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      data-slot="linkoverlay"
      className={cn('text-foreground hover:text-foreground/90', className)}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}
