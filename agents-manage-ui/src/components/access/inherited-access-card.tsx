'use client';

import type { FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PrincipalAvatar } from './principal-avatar';
import type { InheritedAccessCardProps } from './types';
import { getPrincipalTypeLabel } from './types';

export const InheritedAccessCard: FC<InheritedAccessCardProps> = ({ config }) => {
  if (config.principals.length === 0) {
    return null;
  }

  return (
    <Card className="border-dashed opacity-80">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center">
          {config.title}
        </CardTitle>
        <CardDescription className="text-xs">{config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {config.principals.map((principal) => (
            <div
              key={`${principal.type}-${principal.id}`}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-muted/50 border border-border/50"
            >
              <PrincipalAvatar principal={principal} size="sm" />
              <span className="text-foreground/80">{principal.displayName}</span>
              {principal.type !== 'user' && (
                <span className="text-xs text-muted-foreground">
                  ({getPrincipalTypeLabel(principal.type)})
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
