import './App.css';

import type { ComponentsConfig, Message } from '@inkeep/cxkit-react-oss/types';

type IkpMessageProps = ComponentsConfig<Record<string, unknown>>['IkpMessage'];

export const UserMessage = ({ message }: { message: Message }) => {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-3xl bg-gray-100 dark:bg-muted text-foreground rounded-3xl rounded-br-xs px-4 py-2">
        <p className="text-sm">
          {message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('')}
        </p>
      </div>
    </div>
  );
};

export const AssistantMessage = ({
  message,
  renderMarkdown,
}: {
  message: Message;
  renderMarkdown: (text: string) => React.ReactNode;
}) => {
  const combinedText = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('');

  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === 'data-operation') {
          return <DataOperation key={index} messagePart={part} />;
        } else if (part.type === 'data-artifact') {
          return <DataArtifact key={index} messagePart={part} />;
        } else {
          return null;
        }
      })}
      {combinedText && renderMarkdown(combinedText)}
    </>
  );
};

const DataOperation = ({ messagePart }: { messagePart: Message['parts'][number] }) => {
  return <div className="flex justify-start mb-4">Thinking...</div>;
};

const DataArtifact = ({ messagePart }: { messagePart: Message['parts'][number] }) => {
  const { data } = messagePart;
  return (
    <div className="flex justify-start mb-4">
      this is a data artifact:
      <p className="text-sm">{data.name}</p>
    </div>
  );
};

export const IkpMessage: IkpMessageProps = (props) => {
  const { message, renderMarkdown } = props;
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  } else {
    return <AssistantMessage message={message} renderMarkdown={renderMarkdown} />;
  }
};
