'use client';

import { useEffect, useState } from 'react';
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
import { fetchAgents } from '@/lib/api/agent-full-client';
import {
  fetchEvaluationSuiteConfig,
  fetchEvaluationSuiteConfigEvaluators,
} from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
import type { Agent } from '@/lib/types/agent-full';

interface SuiteConfigViewDialogProps {
  tenantId: string;
  projectId: string;
  suiteConfigId: string;
  suiteConfigName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuiteConfigViewDialog({
  tenantId,
  projectId,
  suiteConfigId,
  suiteConfigName,
  isOpen,
  onOpenChange,
}: SuiteConfigViewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [suiteConfig, setSuiteConfig] = useState<{
    description: string;
    filters: Record<string, unknown> | null;
    sampleRate: number | null;
  } | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (isOpen && suiteConfigId && tenantId && projectId) {
      loadSuiteConfigDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, suiteConfigId]);

  const loadSuiteConfigDetails = async () => {
    if (!suiteConfigId || !tenantId || !projectId) {
      return;
    }

    setLoading(true);
    try {
      const [suiteConfigRes, evaluatorsRes, agentsRes] = await Promise.all([
        fetchEvaluationSuiteConfig(tenantId, projectId, suiteConfigId).catch((err) => {
          console.error('Error fetching suite config:', err);
          throw err;
        }),
        fetchEvaluationSuiteConfigEvaluators(tenantId, projectId, suiteConfigId).catch((err) => {
          console.error('Error fetching suite config evaluators:', err);
          return { data: [] };
        }),
        fetchAgents(tenantId, projectId).catch((err) => {
          console.error('Error fetching agents:', err);
          return { data: [] };
        }),
      ]);

      if (!suiteConfigRes?.data) {
        console.error('No suite config data returned');
        return;
      }

      const suiteConfigData = suiteConfigRes.data;
      setSuiteConfig({
        description: suiteConfigData.description,
        filters: suiteConfigData.filters,
        sampleRate: suiteConfigData.sampleRate,
      });

      // Get evaluator IDs from relations
      const evaluatorIds =
        evaluatorsRes.data?.map((rel: { evaluatorId: string }) => rel.evaluatorId) || [];

      // Fetch full evaluator details
      if (evaluatorIds.length > 0) {
        const allEvaluatorsRes = await fetchEvaluators(tenantId, projectId);
        const matchedEvaluators = (allEvaluatorsRes.data || []).filter((evaluator) =>
          evaluatorIds.includes(evaluator.id)
        );
        setEvaluators(matchedEvaluators);
      }

      setAgents(agentsRes.data || []);
    } catch (error) {
      console.error('Error loading suite config details:', error);
      setSuiteConfig(null);
      setEvaluators([]);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const getAgentNames = (agentIds?: string[]): string[] => {
    if (!agentIds || agentIds.length === 0) {
      return [];
    }
    return agents
      .filter((agent) => agentIds.includes(agent.id))
      .map((agent) => agent.name || agent.id);
  };

  const agentIds = suiteConfig?.filters
    ? (suiteConfig.filters as { agentIds?: string[] }).agentIds
    : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[80vw] w-[80vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Evaluation Plan: {suiteConfigName}</DialogTitle>
          <DialogDescription>View the evaluation plan details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {loading ? (
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
              {/* Description */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Description</Label>
                <div className="bg-muted rounded-md p-3">
                  <span className="text-sm">{suiteConfig.description || 'No description'}</span>
                </div>
              </div>

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
                    onChange={() => {}}
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
