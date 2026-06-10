'use client';

import { Ban, Check, CircleOff, Minus } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CacheState } from '@/constants/signoz';

type BadgeVariant = 'success' | 'error' | 'warning' | 'code';

interface VariantConfig {
  variant: BadgeVariant;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  ariaLabel: string;
  tooltip: string;
}

const STATE_CONFIG: Record<CacheState, VariantConfig> = {
  HIT: {
    variant: 'success',
    Icon: Check,
    label: 'HIT',
    ariaLabel: 'Cache hit',
    tooltip: 'Input tokens served from provider cache',
  },
  MISS: {
    variant: 'warning',
    Icon: Minus,
    label: 'MISS',
    ariaLabel: 'Cache miss',
    tooltip: 'Input tokens were not served from the provider cache',
  },
  'NOT-ATTEMPTED': {
    variant: 'code',
    Icon: CircleOff,
    label: 'Skipped',
    ariaLabel: 'Cache not attempted',
    tooltip: 'No cache markers attached to this call',
  },
  'NOT-SUPPORTED-BY-PROVIDER': {
    variant: 'code',
    Icon: Ban,
    label: 'N/A',
    ariaLabel: 'Cache not supported by provider',
    tooltip: 'Provider does not support prompt caching for this model',
  },
};

interface CacheStateBadgeProps {
  state: CacheState | undefined;
  readTokens?: number;
  writeTokens?: number;
  className?: string;
}

export function CacheStateBadge({
  state,
  readTokens,
  writeTokens,
  className,
}: CacheStateBadgeProps) {
  const resolvedState: CacheState = state ?? 'NOT-ATTEMPTED';
  const config = STATE_CONFIG[resolvedState];

  const counts =
    readTokens != null || writeTokens != null
      ? `${(readTokens ?? 0).toLocaleString()} read / ${(writeTokens ?? 0).toLocaleString()} write`
      : null;

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={config.variant}
            className={className}
            tabIndex={0}
            aria-label={
              counts
                ? `${config.ariaLabel} — ${config.tooltip} (${counts})`
                : `${config.ariaLabel} — ${config.tooltip}`
            }
            data-cache-state={resolvedState}
          >
            <config.Icon aria-hidden="true" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div>{config.tooltip}</div>
          {counts && <div className="mt-0.5 font-mono text-xs opacity-80">{counts}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
