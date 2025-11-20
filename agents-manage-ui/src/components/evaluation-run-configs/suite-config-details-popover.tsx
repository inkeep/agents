'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fetchAgents } from '@/lib/api/agent-full-client';
import {
  fetchEvaluationSuiteConfig,
  fetchEvaluationSuiteConfigEvaluators,
} from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
import type { Agent } from '@/lib/types/agent-full';

interface SuiteConfigDetailsPopoverProps {
  tenantId: string;
  projectId: string;
  suiteConfigId: string;
  suiteConfigName: string;
}

export function SuiteConfigDetailsPopover({
  tenantId,
  projectId,
  suiteConfigId,
  suiteConfigName,
}: SuiteConfigDetailsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suiteConfig, setSuiteConfig] = useState<{
    filters: Record<string, unknown> | null;
    sampleRate: number | null;
  } | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (!suiteConfigId || !tenantId || !projectId) {
      return;
    }
    if (isOpen && !suiteConfig) {
      loadSuiteConfigDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadSuiteConfigDetails = async () => {
    if (!suiteConfigId) {
      console.error('Suite config ID is missing');
      return;
    }

    if (!tenantId || !projectId) {
      console.error('Tenant ID or Project ID is missing', { tenantId, projectId });
      return;
    }

    setLoading(true);
    try {
      console.log('Loading suite config details:', { tenantId, projectId, suiteConfigId });

      const [suiteConfigRes, evaluatorsRes, agentsRes] = await Promise.all([
        fetchEvaluationSuiteConfig(tenantId, projectId, suiteConfigId).catch((err) => {
          console.error('Error fetching suite config:', err);
          throw err;
        }),
        fetchEvaluationSuiteConfigEvaluators(tenantId, projectId, suiteConfigId).catch((err) => {
          console.error('Error fetching suite config evaluators:', err);
          // Don't throw - we can still show other details
          return { data: [] };
        }),
        fetchAgents(tenantId, projectId).catch((err) => {
          console.error('Error fetching agents:', err);
          // Don't throw - we can still show other details
          return { data: [] };
        }),
      ]);

      if (!suiteConfigRes?.data) {
        console.error('No suite config data returned');
        return;
      }

      const suiteConfigData = suiteConfigRes.data;
      setSuiteConfig({
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
      // Reset state on error
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

  // Don't render if suiteConfigId is missing
  if (!suiteConfigId || !tenantId || !projectId) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-2">{suiteConfigName}</h4>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading details...</div>
          ) : suiteConfig === null && !loading ? (
            <div className="text-sm text-muted-foreground">
              Failed to load evaluation plan details. Please try again.
            </div>
          ) : (
            <>
              {evaluators.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Evaluators ({evaluators.length})
                  </div>
                  <div className="space-y-1">
                    {evaluators.map((evaluator) => (
                      <div key={evaluator.id} className="text-sm">
                        <div className="font-medium">{evaluator.name}</div>
                        {evaluator.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {evaluator.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {agentIds && agentIds.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Agent Filters ({agentIds.length})
                  </div>
                  <div className="text-sm">
                    {getAgentNames(agentIds).join(', ') || agentIds.join(', ')}
                  </div>
                </div>
              )}

              {suiteConfig?.sampleRate !== null && suiteConfig?.sampleRate !== undefined && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Sample Rate</div>
                  <div className="text-sm">{(suiteConfig.sampleRate * 100).toFixed(1)}%</div>
                </div>
              )}

              {evaluators.length === 0 &&
                (!agentIds || agentIds.length === 0) &&
                (suiteConfig?.sampleRate === null || suiteConfig?.sampleRate === undefined) && (
                  <div className="text-sm text-muted-foreground">
                    No additional details available
                  </div>
                )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
