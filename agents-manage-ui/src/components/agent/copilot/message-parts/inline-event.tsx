import { ChevronRight } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const getOperationLabel = (operation: any) => {
  // Use LLM-generated label if available for data-operations
  if (operation.label) {
    return operation.label;
  }

  const { type } = operation;
  switch (type) {
    case 'agent_initializing':
      return 'Agent initializing';
    case 'agent_ready':
      return 'Agent ready';
    case 'completion':
      return 'Completion';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  }
};

export const InlineEvent: FC<{ operation: any; isLast: boolean }> = ({ operation, isLast }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getLabel = () => {
    return getOperationLabel(operation);
  };

  const getExpandedContent = () => {
    return operation.details || {};
  };

  return (
    <div className="flex flex-col items-start my-2 relative">
      {/* Connection line */}
      {!isLast && (
        <div className="absolute left-1.5 top-6 bottom-0 w-px bg-gray-200 dark:bg-border" />
      )}
      <div className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 dark:hover:text-gray-300 transition-colors ml-[5px] justify-start">
        <span className="w-1 h-1 bg-gray-400 rounded-full" />
        <span className="font-medium ml-1 text-left">{getLabel()}</span>
      </div>
      {/* <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer ml-[5px] justify-start"
      >
        <span className="w-1 h-1 bg-gray-400 rounded-full" />
        <span className="font-medium ml-3 text-left">{getLabel()}</span>
        <ChevronRight
          className={cn(
            'w-3 h-3 transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0'
          )}
        />
      </button> */}

      {/* {isExpanded && (
        <div className=" ml-6 pb-2 mt-2 rounded text-xs">
          {operation.type === 'data-summary' ? (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div className="font-medium mb-1 text-gray-700 dark:text-gray-300">
                {operation.label}
              </div>
              {operation.details && Object.keys(operation.details).length > 0 && (
                <pre className="whitespace-pre-wrap font-mono">
                  {JSON.stringify(operation.details, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
              {JSON.stringify(getExpandedContent(), null, 2)}
            </pre>
          )}
        </div>
      )} */}
    </div>
  );
};
