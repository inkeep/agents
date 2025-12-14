import { Panel } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { LoadingIndicator } from './copilot/message-parts/loading';

export const CopilotStreamingOverlay = () => {
  return (
    <>
      <div className="w-full h-full bg-background/50 absolute top-0 left-0 z-1" />
      <Panel position="top-center" className="z-10">
        <div className="flex items-center gap-2 bg-background dark:bg-sidebar px-4 py-2 rounded-lg shadow-[0_2px_20px_rgba(0,0,0,0.08)] dark:shadow-none z-10">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <LoadingIndicator
            messages={['Thinking', 'Reviewing agent', 'Preparing changes']}
            variant="tailwind"
          />
        </div>
      </Panel>
    </>
  );
};
