import { Users } from 'lucide-react';
import type { Agent } from '@/lib/types/agent-full';
import { SelectorItem, SelectorItemIcon } from '../selector-item';

interface TeamAgentItemProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

export function TeamAgentItem({ agent, onClick }: TeamAgentItemProps) {
  const { id, name, description } = agent;

  return (
    <SelectorItem
      id={id}
      name={name}
      description={description}
      icon={
        <SelectorItemIcon>
          <Users className="size-4 text-muted-foreground" />
        </SelectorItemIcon>
      }
      onClick={() => onClick(agent)}
    />
  );
}
