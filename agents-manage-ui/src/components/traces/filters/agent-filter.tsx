'use client';

import type { OptionType } from '@/components/ui/combobox';
import { Combobox } from '@/components/ui/combobox';
import { useAgentsQuery } from '@/lib/query/agents';
import { FilterTriggerComponent } from './filter-trigger';

interface AgentFilterProps {
  onSelect: (value?: string) => void;
  selectedValue: string | undefined;
}

export const AgentFilter = ({ onSelect, selectedValue }: AgentFilterProps) => {
  const { data: agents, isFetching } = useAgentsQuery();
  const agentOptions: OptionType[] = agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    searchBy: agent.name,
  }));
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
          disabled={isFetching}
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
