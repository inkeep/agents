'use client';

import * as luIcons from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Children, createElement, type FC, type ReactNode } from 'react';
import * as brandIcons from '@/components/brand-icons';
import { cn } from '@/lib/utils';

function resolveIcon(iconName?: string): ReactNode {
  if (!iconName) return null;

  if (iconName.startsWith('brand/')) {
    const BrandIcon = brandIcons[iconName.slice(6) as keyof typeof brandIcons];
    if (BrandIcon) return createElement(BrandIcon);
  } else if (iconName.startsWith('Lu')) {
    // @ts-expect-error lucide icons are keyed by unprefixed name
    const LuIcon: FC<{ className?: string }> | undefined = luIcons[iconName.slice(2)];
    if (LuIcon) return createElement(LuIcon, { className: 'h-6 w-6' });
  }

  return null;
}

export interface OptionCardProps {
  title: string;
  icon?: string;
  href?: string;
  badge?: string;
  highlighted?: boolean;
  cta?: string;
  subtitle?: string;
  children?: ReactNode;
}

export function OptionCard({
  title,
  icon,
  href,
  badge,
  highlighted = false,
  cta,
  subtitle,
  children,
}: OptionCardProps) {
  const isExternal = href?.startsWith('http');
  const iconNode = resolveIcon(icon);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-6 transition-shadow',
        highlighted
          ? 'border-[hsl(var(--primary))] shadow-md shadow-[hsl(var(--primary))]/5 dark:shadow-[hsl(var(--primary))]/10'
          : 'border-fd-border'
      )}
    >
      {badge && (
        <div
          className={cn(
            'absolute -top-3 left-4 rounded-full px-3 py-0.5 text-xs font-medium',
            highlighted
              ? 'bg-[hsl(var(--primary))] text-white'
              : 'bg-fd-muted text-fd-muted-foreground'
          )}
        >
          {badge}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        {iconNode && (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg [&>svg]:h-6 [&>svg]:w-6',
              highlighted
                ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                : 'bg-fd-muted text-fd-muted-foreground'
            )}
          >
            {iconNode}
          </div>
        )}
        <h3 className="text-lg font-semibold text-fd-foreground">{title}</h3>
      </div>

      {subtitle && <p className="mb-3 text-sm text-fd-muted-foreground">{subtitle}</p>}

      {children && (
        <div className="mb-6 flex-1 text-sm text-fd-foreground prose-no-margin [&_ul]:list-none [&_ul]:pl-0 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-[hsl(var(--primary))] [&_li]:before:content-['✓']">
          {children}
        </div>
      )}

      {cta && href && (
        <Link
          href={href}
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className={cn(
            'mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
            highlighted
              ? 'bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90'
              : 'border border-fd-border bg-fd-background text-fd-foreground hover:bg-fd-muted'
          )}
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export interface OptionCardsProps {
  columns?: number;
  children?: ReactNode;
}

export function OptionCards({ columns, children }: OptionCardsProps) {
  const count = columns ?? Children.count(children);
  const colsClass =
    count <= 2
      ? 'sm:grid-cols-2'
      : count === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return <div className={cn('not-prose mt-6 grid gap-6', colsClass)}>{children}</div>;
}
