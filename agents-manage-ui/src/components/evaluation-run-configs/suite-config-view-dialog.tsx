'use client';

import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentsQuery } from '@/lib/query/agents';
import {
  useEvaluationSuiteConfigEvaluatorsQuery,
  useEvaluationSuiteConfigQuery,
} from '@/lib/query/evaluation-suite-configs';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';

interface SuiteConfigViewDialogProps {
  suiteConfigId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuiteConfigViewDialog({
  suiteConfigId,
  isOpen,
  onOpenChange,
}: SuiteConfigViewDialogProps) {
  'use memo';

  const { data: suiteConfigData, isFetching: suiteConfigFetching } = useEvaluationSuiteConfigQuery({
    suiteConfigId,
    enabled: isOpen,
  });
  const { data: suiteConfigEvaluators, isFetching: suiteConfigEvaluatorsFetching } =
    useEvaluationSuiteConfigEvaluatorsQuery({
      suiteConfigId,
      enabled: isOpen,
    });
  const { data: agents, isFetching: agentsFetching } = useAgentsQuery({ enabled: isOpen });
  const { data: allEvaluators, isFetching: evaluatorsFetching } = useEvaluatorsQuery({
    enabled: isOpen,
  });
  const suiteConfig = suiteConfigData && {
    filters: suiteConfigData.filters,
    sampleRate: suiteConfigData.sampleRate,
  };
  // Get evaluator IDs from relations
  const evaluatorIds = suiteConfigEvaluators.map((rel) => rel.evaluatorId);
  const evaluators = evaluatorIds.length
    ? allEvaluators.filter((evaluator) => evaluatorIds.includes(evaluator.id))
    : [];
  const isLoading =
    suiteConfigFetching || suiteConfigEvaluatorsFetching || evaluatorsFetching || agentsFetching;

  const getAgentNames = (agentIds?: string[]): string[] => {
    if (!agentIds || agentIds.length === 0) {
      return [];
    }
    return agents.filter((agent) => agentIds.includes(agent.id)).map((agent) => agent.name);
  };

  const agentIds = suiteConfig?.filters
    ? (suiteConfig.filters as { agentIds?: string[] }).agentIds
    : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[80vw] w-[80vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Evaluation Plan: {suiteConfigId}</DialogTitle>
          <DialogDescription>View the evaluation plan details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : suiteConfig === null ? (
            <div className="text-sm text-muted-foreground">
              Failed to load evaluation plan details. Please try again.
            </div>
          ) : (
            <>
              {/* Evaluators */}
              {evaluators.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Evaluators ({evaluators.length})</Label>
                  <div className="space-y-2">
                    {evaluators.map((evaluator) => (
                      <div key={evaluator.id} className="bg-muted rounded-md p-3">
                        <div className="font-medium text-sm">{evaluator.name}</div>
                        {evaluator.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {evaluator.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent Filters */}
              {agentIds && agentIds.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Agent Filters ({agentIds.length})</Label>
                  <div className="bg-muted rounded-md p-3">
                    <div className="text-sm">
                      {getAgentNames(agentIds).join(', ') || agentIds.join(', ')}
                    </div>
                  </div>
                </div>
              )}

              {/* Sample Rate */}
              {suiteConfig.sampleRate !== null && suiteConfig.sampleRate !== undefined && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sample Rate</Label>
                  <div className="bg-muted rounded-md p-3">
                    <span className="text-sm">{(suiteConfig.sampleRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {/* Filters */}
              {suiteConfig.filters && Object.keys(suiteConfig.filters).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Filters</Label>
                  <ExpandableJsonEditor
                    name="filters"
                    value={JSON.stringify(suiteConfig.filters, null, 2)}
                    readOnly
                  />
                </div>
              )}

              {evaluators.length === 0 &&
                (!agentIds || agentIds.length === 0) &&
                (suiteConfig.sampleRate === null || suiteConfig.sampleRate === undefined) &&
                (!suiteConfig.filters || Object.keys(suiteConfig.filters).length === 0) && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No additional details available
                  </div>
                )}
            </>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
