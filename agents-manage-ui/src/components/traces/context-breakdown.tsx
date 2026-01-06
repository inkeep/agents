'use client';

import { V1_BREAKDOWN_SCHEMA } from '@inkeep/agents-core/client-exports';
import { FileText, MessageSquare, PieChart, Settings, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import type { ContextBreakdown as ContextBreakdownType } from '@/components/traces/timeline/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Tailwind safelist - these classes are dynamically applied from V1_BREAKDOWN_SCHEMA
 * and must be listed here for Tailwind to include them in the CSS bundle.
 * @see packages/agents-core/src/constants/context-breakdown.ts
 */
const _TAILWIND_SAFELIST = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-purple-500',
  'bg-sky-500',
  'bg-gray-500',
];

interface ContextBreakdownProps {
  breakdown: ContextBreakdownType;
}

interface BreakdownItem {
  key: string;
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}


export function ContextBreakdown({ breakdown }: ContextBreakdownProps) {
  const items = useMemo<BreakdownItem[]>(() => {
    // Use V1_BREAKDOWN_SCHEMA to dynamically build breakdown display
    return V1_BREAKDOWN_SCHEMA.map((def) => ({
      key: def.key,
      label: def.label,
      value: breakdown.components[def.key] ?? 0,
      color: def.color || 'bg-gray-500',
    }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [breakdown]);

  const maxValue = useMemo(() => Math.max(...items.map((i) => i.value), 1), [items]);

  if (breakdown.total === 0) {
    return null;
  }

  return (
    <Card className="shadow-none bg-background">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-foreground">
          Context Token Breakdown
        </CardTitle>
        <PieChart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-1 mb-4">
          <div className="text-2xl font-bold text-foreground">
            ~{breakdown.total.toLocaleString()} tokens
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated context window usage (approximate)
          </p>
        </div>

        {/* Stacked bar visualization */}
        <div className="mb-4">
          <div className="h-4 rounded-full overflow-hidden flex bg-muted">
            {items.map((item) => {
              const percentage = (item.value / breakdown.total) * 100;
              if (percentage < 0.5) return null; // Skip very small segments
              return (
                <div
                  key={item.key}
                  className={`${item.color} transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                  title={`${item.label}: ${item.value.toLocaleString()} tokens (${percentage.toFixed(1)}%)`}
                />
              );
            })}
          </div>
        </div>

        {/* Detailed breakdown list */}
        <div className="space-y-2">
          {items.map((item) => {
            const percentage = (item.value / breakdown.total) * 100;
            const barWidth = (item.value / maxValue) * 100;

            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                    <span className="text-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono text-xs">{item.value.toLocaleString()}</span>
                    <span className="text-xs">({percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                  <div
                    className={`h-full ${item.color} transition-all duration-300`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
