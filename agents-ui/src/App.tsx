import './App.css';
import { InkeepEmbeddedChat } from '@inkeep/cxkit-react-oss';
import { IkpMessage } from './IkpMessage';

function App() {
  return (
    <div>
      <InkeepEmbeddedChat
        baseSettings={{
          primaryBrandColor: '#3784ff',
        }}
        aiChatSettings={{
          graphUrl: 'http://localhost:3003/api/chat',
          apiKey: 'YOUR_API_KEY',
          components: {
            IkpMessage,
          },
        }}
      />
    </div>
  );
}

export default App;
