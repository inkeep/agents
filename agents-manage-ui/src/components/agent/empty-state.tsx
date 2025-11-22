import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { CopilotSection } from './copilot/copilot-section';

export const EmptyState = () => {
  return (
    <div>
      <CopilotSection />
      <div className="flex items-center gap-4 my-10">
        <Separator className="flex-1" />
        <span className="text-gray-400 dark:text-white/30 text-sm font-mono uppercase">or</span>
        <Separator className="flex-1" />
      </div>
      <div className="flex justify-center">
        <Button variant="outline-primary" size="sm">
          Start from scratch
        </Button>
      </div>
    </div>
  );
};
