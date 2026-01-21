import { Globe } from 'lucide-react';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { SelectorItem, SelectorItemIcon } from '../selector-item';

interface ExternalAgentItemProps {
  externalAgent: ExternalAgent;
  onClick: (externalAgent: ExternalAgent) => void;
}

export function ExternalAgentItem({ externalAgent, onClick }: ExternalAgentItemProps) {
  const { id, name, description, baseUrl } = externalAgent;

  return (
    <SelectorItem
      id={id}
      name={name}
      description={description ?? undefined}
      subtitle={baseUrl ?? undefined}
      icon={
        <SelectorItemIcon>
          <Globe className="size-4 text-muted-foreground" />
        </SelectorItemIcon>
      }
      onClick={() => onClick(externalAgent)}
    />
  );
}
