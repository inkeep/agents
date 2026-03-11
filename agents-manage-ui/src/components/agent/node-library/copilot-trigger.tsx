import { SparklesIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { FlowButton } from '@/components/agent/flow-button';
import { useCopilotContext } from '@/contexts/copilot';

export function CopilotTrigger({ className }: { className: string }) {
  const { openCopilot, isCopilotConfigured } = useCopilotContext();
  const { agentId } = useParams<{ agentId?: string }>();

  if (!isCopilotConfigured) {
    return;
  }

  return (
    <FlowButton variant="outline-primary" onClick={openCopilot} className={className}>
      <SparklesIcon />
      {agentId ? 'Edit with AI' : 'Build with AI'}
    </FlowButton>
  );
}
