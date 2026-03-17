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
          baseUrl: 'http://localhost:3002',
          appId: 'YOUR_APP_ID',
        }}
      />
    </div>
  );
}

export default App;
