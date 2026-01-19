import './App.css';
import { InkeepEmbeddedChat } from '@inkeep/agents-ui';

function App() {
  return (
    <div className="inkeep-chat-container">
      <InkeepEmbeddedChat
        baseSettings={{
          primaryBrandColor: '#3784ff',
        }}
        aiChatSettings={{
          headers: {
            'x-inkeep-tenant-id': 'default',
            'x-inkeep-project-id': 'andrew1',
            'x-inkeep-agent-id': 'saloon',
            'x-api-key': import.meta.env.VITE_INKEEP_AGENTS_RUN_API_KEY,
          },
          agentUrl: 'http://localhost:3003/api/chat',
          apiKey: import.meta.env.VITE_INKEEP_AGENTS_RUN_API_KEY,
        }}
      />
    </div>
  );
}

export default App;
