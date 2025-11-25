import { SparklesIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { useCopilotContext } from '../copilot/copilot-context';

export function CopilotTrigger() {
  const { openCopilot } = useCopilotContext();
  const { agentId } = useParams<{ agentId?: string }>();
  const {
    PUBLIC_INKEEP_COPILOT_AGENT_ID,
    PUBLIC_INKEEP_COPILOT_PROJECT_ID,
    PUBLIC_INKEEP_COPILOT_TENANT_ID,
  } = useRuntimeConfig();
  if (
    !PUBLIC_INKEEP_COPILOT_AGENT_ID ||
    !PUBLIC_INKEEP_COPILOT_PROJECT_ID ||
    !PUBLIC_INKEEP_COPILOT_TENANT_ID
  ) {
    return null;
  }
  return (
    <Button
      className="normal-case justify-start font-sans dark:bg-input/30 dark:border-input dark:hover:bg-input/50 backdrop-blur-3xl"
      variant="outline-primary"
      type="button"
      onClick={openCopilot}
    >
      <SparklesIcon />
      {agentId ? 'Edit with AI' : 'Build with AI'}
    </Button>
  );
}
