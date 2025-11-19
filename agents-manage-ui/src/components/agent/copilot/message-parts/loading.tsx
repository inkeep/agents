import { useEffect, useState } from 'react';

export const LoadingDots = () => {
  return (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`animate-bounce-dot opacity-30`}
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        >
          .
        </span>
      ))}
    </div>
  );
};

export function LoadingIndicator({
  messages = ['Thinking', 'Looking for content', 'Analyzing'],
}: {
  messages?: string[];
}) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prevIndex) => {
        if (prevIndex + 1 < messages.length) {
          return prevIndex + 1;
        }
        clearInterval(interval);
        return prevIndex;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div
      className="flex items-center space-x-2 font-medium text-sm text-gray-700 dark:text-gray-dark-300"
      aria-live="polite"
    >
      <span className="animate-shimmer bg-[linear-gradient(to_bottom_right,_var(--ikp-color-gray-700),_var(--ikp-color-gray-400))] dark:bg-[linear-gradient(to_bottom_right,_var(--ikp-color-gray-dark-300),_var(--ikp-color-gray-dark-100))] bg-clip-text text-transparent">
        {messages[messageIndex]}
      </span>
      <div className="flex space-x-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`animate-bounce-dot opacity-30`}
            style={{
              animationDelay: `${i * 0.2}s`,
            }}
          >
            .
          </span>
        ))}
      </div>
    </div>
  );
}
