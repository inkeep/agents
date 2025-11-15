import { diffWords } from 'diff';
import type React from 'react';
import { useMemo } from 'react';

type TextDiffProps = {
  oldValue: string;
  newValue: string;
  className?: string;
};

export const TextDiff: React.FC<TextDiffProps> = ({ oldValue, newValue, className = '' }) => {
  const parts = useMemo(() => diffWords(oldValue ?? '', newValue ?? ''), [oldValue, newValue]);

  return (
    <div className={`text-sm leading-relaxed whitespace-pre-wrap space-x-0.5 ${className}`}>
      {parts.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-primary/10 dark:bg-sky-blue/30 text-azure-900 dark:text-crystal-blue rounded-sm px-1 py-0.5"
            >
              {part.value}
            </span>
          );
        }

        if (part.removed) {
          return (
            <span key={index} className="line-through text-gray-400 dark:text-white/40">
              {part.value}
            </span>
          );
        }

        // unchanged
        return <span key={index}>{part.value}</span>;
      })}
    </div>
  );
};
