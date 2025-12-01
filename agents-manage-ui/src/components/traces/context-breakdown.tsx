'use client';

import { FileText, MessageSquare, PieChart, Settings, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ContextBreakdown as ContextBreakdownType } from '@/components/traces/timeline/types';

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

const BREAKDOWN_CONFIG: Record<
  keyof Omit<ContextBreakdownType, 'total'>,
  { label: string; color: string; icon: React.ReactNode }
> = {
  systemPromptTemplate: {
    label: 'System Prompt Template',
    color: 'bg-blue-500',
    icon: <FileText className="h-4 w-4" />,
  },
  coreInstructions: {
    label: 'Core Instructions',
    color: 'bg-indigo-500',
    icon: <Settings className="h-4 w-4" />,
  },
  agentPrompt: {
    label: 'Agent Prompt',
    color: 'bg-violet-500',
    icon: <FileText className="h-4 w-4" />,
  },
  toolsSection: {
    label: 'Tools (MCP/Function/Relation)',
    color: 'bg-emerald-500',
    icon: <Wrench className="h-4 w-4" />,
  },
  artifactsSection: {
    label: 'Artifacts',
    color: 'bg-amber-500',
    icon: <FileText className="h-4 w-4" />,
  },
  dataComponents: {
    label: 'Data Components',
    color: 'bg-orange-500',
    icon: <PieChart className="h-4 w-4" />,
  },
  artifactComponents: {
    label: 'Artifact Components',
    color: 'bg-rose-500',
    icon: <FileText className="h-4 w-4" />,
  },
  transferInstructions: {
    label: 'Transfer Instructions',
    color: 'bg-cyan-500',
    icon: <Settings className="h-4 w-4" />,
  },
  delegationInstructions: {
    label: 'Delegation Instructions',
    color: 'bg-teal-500',
    icon: <Settings className="h-4 w-4" />,
  },
  thinkingPreparation: {
    label: 'Thinking Preparation',
    color: 'bg-purple-500',
    icon: <Settings className="h-4 w-4" />,
  },
  conversationHistory: {
    label: 'Conversation History',
    color: 'bg-sky-500',
    icon: <MessageSquare className="h-4 w-4" />,
  },
};

export function ContextBreakdown({ breakdown }: ContextBreakdownProps) {
  const items = useMemo<BreakdownItem[]>(() => {
    const result: BreakdownItem[] = [];

    for (const [key, config] of Object.entries(BREAKDOWN_CONFIG)) {
      const value = breakdown[key as keyof Omit<ContextBreakdownType, 'total'>];
      if (value > 0) {
        result.push({
          key,
          label: config.label,
          value,
          color: config.color,
          icon: config.icon,
        });
      }
    }

    // Sort by value descending
    result.sort((a, b) => b.value - a.value);
    return result;
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

        {/* Legend note */}
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Token counts are estimated using ~4 characters per token approximation. Actual token
            usage may vary by model.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
