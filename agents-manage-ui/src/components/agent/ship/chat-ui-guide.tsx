import { Streamdown } from 'streamdown';
import { ChatUiPreview } from './chat-ui-preview';

export function ChatUiGuide() {
  return (
    <div className="space-y-4">
      <p>
        Drop-in React components for chat UIs with built-in streaming and rich UI customization.
      </p>
      {/* <div className="text-xs font-medium text-primary uppercase tracking-wide font-mono">
        Step 1
      </div> */}
      <p>Install the package:</p>
      <Streamdown>
        {`

\`\`\`bash
npm install @inkeep/agents-ui
\`\`\`

`}
      </Streamdown>
      {/* <div className="text-xs font-medium text-primary uppercase tracking-wide font-mono">
        Step 2
      </div> */}
      <ChatUiPreview />
    </div>
  );
}
