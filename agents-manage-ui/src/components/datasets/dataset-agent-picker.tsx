'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import {
  addDatasetAgentAction,
  fetchDatasetAgentsAction,
  removeDatasetAgentAction,
} from '@/lib/actions/agent-relations';
import { useAgentsQuery } from '@/lib/query/agents';
import { createLookup } from '@/lib/utils';

interface DatasetAgentPickerProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
}

export function DatasetAgentPicker({ tenantId, projectId, datasetId }: DatasetAgentPickerProps) {
  const { data: agents, isFetching: loadingAgents } = useAgentsQuery();
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchDatasetAgentsAction(tenantId, projectId, datasetId).then((result) => {
      if (result.success && result.data) {
        setSelectedAgentIds(result.data.map((r) => r.agentId));
      }
      setLoaded(true);
    });
  }, [tenantId, projectId, datasetId]);

  const agentLookup = useMemo(() => createLookup(agents), [agents]);

  const handleSelectionChange = useCallback(
    async (newSelection: string[]) => {
      const prev = selectedAgentIds;
      setSelectedAgentIds(newSelection);
      setSyncing(true);

      try {
        const added = newSelection.filter((id) => !prev.includes(id));
        const removed = prev.filter((id) => !newSelection.includes(id));

        await Promise.all([
          ...added.map((agentId) => addDatasetAgentAction(tenantId, projectId, datasetId, agentId)),
          ...removed.map((agentId) =>
            removeDatasetAgentAction(tenantId, projectId, datasetId, agentId)
          ),
        ]);
      } catch {
        setSelectedAgentIds(prev);
        toast.error('Failed to update agent associations');
      } finally {
        setSyncing(false);
      }
    },
    [selectedAgentIds, tenantId, projectId, datasetId]
  );

  if (!loaded || loadingAgents) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Agent Scope</label>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Agent Scope</label>
      <p className="text-xs text-muted-foreground">
        {selectedAgentIds.length === 0
          ? 'No agents selected — this test suite is available to all agents in the project.'
          : 'This test suite is scoped to the selected agents only.'}
      </p>
      <ComponentSelector
        componentLookup={agentLookup}
        selectedComponents={selectedAgentIds}
        onSelectionChange={handleSelectionChange}
        emptyStateMessage="No agents available."
        emptyStateActionText="Create agent"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
        placeholder="Select agents to scope this test suite..."
      />
    </div>
  );
}
