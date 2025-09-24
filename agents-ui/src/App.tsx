import './App.css';
import { InkeepEmbeddedChat } from '@inkeep/cxkit-react-oss';

function App() {
  return (
    <div className="inkeep-chat-container">
      <InkeepEmbeddedChat
        baseSettings={{
          primaryBrandColor: '#3784ff',
        }}
        aiChatSettings={{
          graphUrl: 'http://localhost:3003/api/chat',
          apiKey: 'YOUR_API_KEY',
        }}
      />
    </div>
  );
}

export default App;
