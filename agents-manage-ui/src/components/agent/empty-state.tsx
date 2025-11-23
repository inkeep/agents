import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { CopilotSection } from './copilot/copilot-section';

interface EmptyStateProps {
  onAddInitialNode: () => void;
}

export const EmptyState = ({ onAddInitialNode }: EmptyStateProps) => {
  return (
    <div>
      <CopilotSection />
      <div className="flex items-center gap-4 my-10">
        <Separator className="flex-1" />
        <span className="text-gray-400 dark:text-white/30 text-sm font-mono uppercase">or</span>
        <Separator className="flex-1" />
      </div>
      <div className="flex justify-center">
        <Button type="button" variant="outline-primary" size="sm" onClick={onAddInitialNode}>
          Start from scratch
        </Button>
      </div>
    </div>
  );
};
