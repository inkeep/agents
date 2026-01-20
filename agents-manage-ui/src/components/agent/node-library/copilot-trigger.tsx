import { SparklesIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCopilotContext } from '@/contexts/copilot';

export function CopilotTrigger() {
  const { openCopilot, isCopilotConfigured } = useCopilotContext();
  const { agentId } = useParams<{ agentId?: string }>();

  if (!isCopilotConfigured) {
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
