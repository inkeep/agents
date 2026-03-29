'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import {
  addEvaluatorAgentAction,
  fetchEvaluatorAgentsAction,
  removeEvaluatorAgentAction,
} from '@/lib/actions/agent-relations';
import { useAgentsQuery } from '@/lib/query/agents';
import { createLookup } from '@/lib/utils';

interface EvaluatorAgentPickerProps {
  tenantId: string;
  projectId: string;
  evaluatorId: string;
}

export function EvaluatorAgentPicker({
  tenantId,
  projectId,
  evaluatorId,
}: EvaluatorAgentPickerProps) {
  const { data: agents, isFetching: loadingAgents } = useAgentsQuery();
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchEvaluatorAgentsAction(tenantId, projectId, evaluatorId).then((result) => {
      if (result.success && result.data) {
        setSelectedAgentIds(result.data.map((r) => r.agentId));
      }
      setLoaded(true);
    });
  }, [tenantId, projectId, evaluatorId]);

  const agentLookup = useMemo(() => createLookup(agents), [agents]);

  const handleSelectionChange = useCallback(
    async (newSelection: string[]) => {
      const prev = selectedAgentIds;
      setSelectedAgentIds(newSelection);

      try {
        const added = newSelection.filter((id) => !prev.includes(id));
        const removed = prev.filter((id) => !newSelection.includes(id));

        await Promise.all([
          ...added.map((agentId) =>
            addEvaluatorAgentAction(tenantId, projectId, evaluatorId, agentId)
          ),
          ...removed.map((agentId) =>
            removeEvaluatorAgentAction(tenantId, projectId, evaluatorId, agentId)
          ),
        ]);
      } catch {
        setSelectedAgentIds(prev);
        toast.error('Failed to update agent associations');
      }
    },
    [selectedAgentIds, tenantId, projectId, evaluatorId]
  );

  if (!loaded || loadingAgents) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Agent Scope</label>
        <p className="text-sm text-muted-foreground">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Agent Scope</label>
      <ComponentSelector
        componentLookup={agentLookup}
        selectedComponents={selectedAgentIds}
        onSelectionChange={handleSelectionChange}
        emptyStateMessage="No agents available."
        emptyStateActionText="Create agent"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
        placeholder="Select agents..."
      />
      <p className="text-xs text-muted-foreground">
        {selectedAgentIds.length === 0
          ? 'No agents selected — this evaluator applies to all agents in the project.'
          : 'This evaluator is scoped to the selected agents only.'}
      </p>
    </div>
  );
}
