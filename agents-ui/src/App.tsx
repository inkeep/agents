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
          agentUrl: 'http://localhost:3003/api/chat',
          apiKey: 'YOUR_API_KEY',
        }}
      />
    </div>
  );
}

export default App;
