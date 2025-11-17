'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { OptionType } from '@/components/ui/combobox';
import { Combobox } from '@/components/ui/combobox';
import { useCurrentRef } from '@/hooks/use-current-ref';
import { getAllAgentsAction } from '@/lib/actions/agent-full';
import { FilterTriggerComponent } from './filter-trigger';

interface AgentFilterProps {
  onSelect: (value?: string) => void;
  selectedValue: string | undefined;
}

export const AgentFilter = ({ onSelect, selectedValue }: AgentFilterProps) => {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const ref = useCurrentRef();
  const [agentOptions, setAgentOptions] = useState<OptionType[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const fetchAgents = async () => {
      try {
        setLoading(true);
        const response = await getAllAgentsAction(tenantId, projectId, ref);
        if (!cancelled && response.success) {
          setAgentOptions(
            response.data?.map((agent) => ({
              value: agent.id,
              label: agent.name,
              searchBy: agent.name,
            })) || []
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch agent:', error);
          setAgentOptions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, ref]);
  return (
    <Combobox
      defaultValue={selectedValue}
      notFoundMessage={'No agents found.'}
      onSelect={(value) => {
        onSelect(value);
      }}
      options={agentOptions}
      TriggerComponent={
        <FilterTriggerComponent
          disabled={loading}
          filterLabel={selectedValue ? 'Agent' : 'All agents'}
          isRemovable={true}
          onDeleteFilter={() => {
            onSelect(undefined);
          }}
          multipleCheckboxValues={selectedValue ? [selectedValue] : []}
          options={agentOptions}
        />
      }
    />
  );
};
