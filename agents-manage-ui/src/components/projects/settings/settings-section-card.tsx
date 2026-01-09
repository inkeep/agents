'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsSectionCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSectionCard({ title, children, className }: SettingsSectionCardProps) {
  return (
    <div className={cn('relative border rounded-lg bg-background', className)}>
      {/* Section label */}
      <div className="absolute -top-3 left-4 px-2 bg-muted">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </span>
      </div>
      
      {/* Content */}
      <div className="p-6 pt-8">
        {children}
      </div>
    </div>
  );
}

