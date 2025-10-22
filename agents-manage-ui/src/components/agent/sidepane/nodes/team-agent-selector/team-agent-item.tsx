import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Agent } from '@/lib/types/agent-full';

interface TeamAgentItemProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

export function TeamAgentItem({ agent, onClick }: TeamAgentItemProps) {
  const { id, name, description } = agent;

  return (
    <Button
      variant="unstyled"
      size="unstyled"
      type="button"
      key={id}
      className="w-full p-3 rounded-lg border cursor-pointer transition-colors border-border hover:bg-muted/50 text-left inline-block"
      id={id}
      onClick={() => onClick(agent)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 size-8 rounded bg-muted flex items-center justify-center">
          <Users className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2 min-w-0 truncate">
            <span className="font-medium text-sm truncate">{name}</span>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground truncate mb-1">{description}</p>
          )}
        </div>
      </div>
    </Button>
  );
}
