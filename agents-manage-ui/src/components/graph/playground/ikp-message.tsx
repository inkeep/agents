import type { Message } from '@inkeep/cxkit-react-oss/types';
import { BookOpen, Check, ChevronRight, LoaderCircle } from 'lucide-react';
import { type FC, useEffect, useState, useRef } from 'react';
import supersub from 'remark-supersub';
import { Streamdown } from 'streamdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IkpMessageProps {
  message: Message;
  isStreaming?: boolean;
  renderMarkdown: (text: string) => React.ReactNode;
  renderComponent: (name: string, props: any) => React.ReactNode;
}

// Citation Badge Component
const CitationBadge: FC<{
  citation: { key: string; href?: string; artifact: any };
}> = ({ citation }) => {
  const { key, href, artifact } = citation;

  const badge = (
    <span
      className={`citation-badge inline-flex items-center justify-center h-5 min-w-5 px-2 mr-1 text-xs font-medium bg-gray-50 dark:bg-muted text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted/80 rounded-full border border-gray-200 dark:border-border transition-colors ${
        href ? 'cursor-pointer' : 'cursor-help'
      }`}
    >
      {key}
    </span>
  );

  const tooltipContent = (
    <div className="p-2">
      <div className="font-medium text-sm mb-1 text-popover-foreground">{artifact.name}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{artifact.description}</div>
    </div>
  );

  if (href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
            {badge}
          </a>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
};

// Inline Data Operation Component
const InlineDataOperation: FC<{ operation: any; isLast: boolean }> = ({ operation, isLast }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { type, ctx } = operation;

  const getOperationLabel = () => {
    // Use LLM-generated label if available (for status updates and other operations)
    if (operation.label) {
      return operation.label;
    }

    switch (type) {
      case 'agent_initializing':
        return 'Agent initializing';
      case 'agent_ready':
        return 'Agent ready';
      case 'completion':
        return 'Completion';
      case 'status_update':
        return 'Status update';
      default:
        return type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
  };

  return (
    <div className="flex flex-col items-start my-2 relative">
      {/* Connection line */}
      {!isLast && (
        <div className="absolute left-1.5 top-6 bottom-0 w-px bg-gray-200 dark:bg-border" />
      )}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer ml-[5px]"
      >
        <span className="w-1 h-1 bg-gray-400 rounded-full" />
        <span className="font-medium ml-3">{getOperationLabel()}</span>
        <ChevronRight
          className={cn(
            'w-3 h-3 transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0'
          )}
        />
      </button>

      {isExpanded && (
        <div className=" ml-6 pb-2 mt-2 rounded text-xs">
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
            {JSON.stringify(ctx, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

// StreamMarkdown component that renders with inline citations and data operations
function StreamMarkdown({ parts }: { parts: any[] }) {
  const [processedParts, setProcessedParts] = useState<any[]>([]);

  // Process parts to create a mixed array of text and inline operations
  useEffect(() => {
    const processed: any[] = [];
    let currentTextChunk = '';

    for (const part of parts) {
      if (part.type === 'text') {
        currentTextChunk += part.text || '';
      } else if (part.type === 'data-operation') {
        const { type } = part.data as any;

        // Only add inline operations for non-top-level operations
        const isTopLevelOperation = [
          'agent_initializing',
          'agent_ready',
          'completion',
          'error',
        ].includes(type);

        if (!isTopLevelOperation) {
          // If we have accumulated text, add it first
          if (currentTextChunk.trim()) {
            processed.push({ type: 'text', content: currentTextChunk });
            currentTextChunk = '';
          }
          // Add the inline operation
          processed.push({ type: 'inline-operation', operation: part.data });
        }
      } else if (part.type === 'data-artifact') {
        // Add artifact as citation marker inline with current text (don't flush)
        const artifactData = part.data as any;
        const artifactSummary = artifactData.artifactSummary || {
          record_type: 'site',
          title: artifactData.name,
          url: undefined,
        };
        currentTextChunk += ` ^${artifactSummary?.title || artifactData.name}^`;
      }
    }

    // Add any remaining text
    if (currentTextChunk.trim()) {
      processed.push({ type: 'text', content: currentTextChunk });
    }

    setProcessedParts(processed);
  }, [parts]);

  // Calculate inline operations for isLast prop
  const inlineOperations = processedParts.filter((part) => part.type === 'inline-operation');
  let inlineOpIndex = 0;

  return (
    <div className="inline">
      {processedParts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <Streamdown
              key={index}
              remarkPlugins={[supersub]}
              components={{
                // Intercept superscript elements to render citations
                sup: ({ children, ...props }) => {
                  // Check if this is a citation (format: ^artifact identifier^)
                  if (children && typeof children === 'string') {
                    // Find the citation part
                    const citation = parts.find(
                      (p) =>
                        p.type === 'data-artifact' &&
                        (p.data.artifactSummary?.title || p.data.name) === children
                    );

                    if (citation) {
                      const artifactData = citation.data as any;
                      const artifactSummary = artifactData.artifactSummary || {
                        record_type: 'site',
                        title: artifactData.name,
                        url: undefined,
                      };

                      return (
                        <CitationBadge
                          citation={{
                            key: artifactSummary?.title || artifactData.name,
                            href: artifactSummary?.url,
                            artifact: { ...artifactData, artifactSummary },
                          }}
                        />
                      );
                    }
                  }
                  // Default superscript rendering
                  return <sup {...props}>{children}</sup>;
                },
              }}
            >
              {part.content}
            </Streamdown>
          );
        } else if (part.type === 'inline-operation') {
          const isLast = inlineOpIndex === inlineOperations.length - 1;
          inlineOpIndex++;
          return <InlineDataOperation key={index} operation={part.operation} isLast={isLast} />;
        }
        return null;
      })}
    </div>
  );
}

// Extract and group operations by type for better UX
function useProcessedOperations(parts: Message['parts']) {
  const [operations, setOperations] = useState<any[]>([]);
  const [textContent, setTextContent] = useState('');
  const [artifacts, setArtifacts] = useState<any[]>([]);

  // Use refs to track seen items - refs don't cause closure issues
  const seenOperationKeys = useRef(new Set<string>());
  const seenArtifactKeys = useRef(new Set<string>());

  // Reset tracking on initial mount to avoid stale data
  useEffect(() => {
    seenOperationKeys.current.clear();
    seenArtifactKeys.current.clear();
    setOperations([]);
    setArtifacts([]);
  }, []); // Only run once on mount

  useEffect(() => {
    // Process only NEW operations and artifacts
    const newOps: any[] = [];
    const newArts: any[] = [];
    let textBuilder = '';

    for (const part of parts) {
      if (part.type === 'data-operation') {
        // Create semantic key for this operation
        const { type, ctx } = part.data as any; // Cast to any to handle new operation types
        let key: string = type;

        // Skip ALL non-top-level operations (they'll be handled as inline by StreamMarkdown)
        const isTopLevelOperation = [
          'agent_initializing',
          'agent_ready',
          'completion',
          'error',
        ].includes(type);

        // Only process top-level operations for the timeline
        if (isTopLevelOperation) {
          switch (type) {
            case 'agent_initializing':
            case 'agent_ready':
              // Use same key so agent_ready replaces agent_initializing
              key = `agent_lifecycle-${ctx.sessionId}`;
              break;
            case 'completion':
              key = `${type}-${ctx.agent}-${ctx.iteration}`;
              break;
            default:
              key = `${type}-${ctx.agent || ''}`;
          }

          if (
            (type === 'agent_ready' || type === 'agent_initializing') &&
            seenOperationKeys.current.has(key)
          ) {
            // Replace agent_initializing with agent_ready
            setOperations((prev) =>
              prev.map((op) =>
                op.uniqueKey === key
                  ? {
                      ...part.data,
                      id: part.id,
                      uniqueKey: key,
                      timestamp: op.timestamp,
                    } // Keep original timestamp for order
                  : op
              )
            );
          } else if (!seenOperationKeys.current.has(key)) {
            // Only add if we haven't seen this operation before
            seenOperationKeys.current.add(key);
            newOps.push({
              ...part.data,
              id: part.id,
              uniqueKey: key, // Add the key for debugging
              timestamp: Date.now(),
            });
          }
        }
        // Inline operations (like tool_call_summary, information_retrieved) are handled by StreamMarkdown
      } else if (part.type === 'data-artifact') {
        const key = part.data.artifactId || part.data.name;
        if (!seenArtifactKeys.current.has(key)) {
          seenArtifactKeys.current.add(key);
          newArts.push(part.data);
        }
      } else if (part.type === 'text') {
        textBuilder += part.text || '';
      }
    }

    // Only update if we have new operations
    if (newOps.length > 0) {
      setOperations((prev) => [...prev, ...newOps]);
    }

    // Only update if we have new artifacts
    if (newArts.length > 0) {
      setArtifacts((prev) => [...prev, ...newArts]);
    }

    // Always update text content
    setTextContent(textBuilder);
  }, [parts]); // Refs don't need to be dependencies

  return { operations, textContent, artifacts };
}

export const IkpMessage: FC<IkpMessageProps> = ({
  message,
  isStreaming = false,
  renderMarkdown,
}) => {
  const { operations, textContent, artifacts } = useProcessedOperations(message.parts);

  // Just use operations in chronological order
  const displayOperations = operations;

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-3xl bg-gray-100 dark:bg-muted text-gray-700 dark:text-foreground rounded-3xl rounded-br-xs px-4 py-2">
          <p className="text-sm">{textContent}</p>
        </div>
      </div>
    );
  }

  // Check if we're still streaming text content or if there are incomplete operations
  const hasActiveOperations =
    isStreaming || message.parts.some((part) => part.type === 'text' && part.state === 'streaming');
  const isLoading = isStreaming || hasActiveOperations;

  return (
    <div className="flex justify-start">
      <div className="max-w-4xl w-full">
        {/* Simple Status Indicator */}
        {(displayOperations.length > 0 || isLoading) && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <>
                  <LoaderCircle className="w-4 h-4 text-gray-400 dark:text-muted-foreground animate-spin" />
                  <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">
                    Processing...
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
                  <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">
                    Completed
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Response */}
        {(textContent ||
          message.parts.some(
            (p) => p.type === 'text' || p.type === 'data-component' || p.type === 'data-operation'
          )) && (
          <div>
            <div className="prose prose-sm max-w-none">
              {/* Render the combined markdown with inline citations using StreamMarkdown */}
              <StreamMarkdown parts={message.parts} />

              {/* Handle data-component parts that weren't processed in the hook */}
              {message.parts
                .filter((part) => part.type === 'data-component')
                .map((part) => {
                  const { type } = part.data;
                  if (type === 'text') {
                    return (
                      <div key={`text-${part.id}`}>{renderMarkdown(part.data.text || '')}</div>
                    );
                  }

                  // return <div key={key}>{renderComponent(part.data.name, part.data.props)}</div>;
                  return (
                    <div
                      key={`component-${part.id}`}
                      className="my-2 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden"
                    >
                      <div className="bg-gray-50 dark:bg-muted px-3 py-1.5 border-b border-gray-200 dark:border-border flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                          <span className="text-xs font-medium text-gray-700 dark:text-foreground">
                            Component: {part.data.name || 'Unnamed'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-muted-foreground font-mono">
                          {JSON.stringify(part.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Source badges */}
            {artifacts.length > 0 && (
              <div className="mt-3 pt-3">
                <div className="text-xs text-gray-500 dark:text-muted-foreground font-medium mb-2">
                  Sources
                </div>
                <div className="space-y-2">
                  {artifacts.map((artifact, index) => {
                    const artifactSummary = artifact.artifactSummary || {
                      record_type: 'site',
                      title: artifact.name,
                      url: undefined,
                    };

                    return (
                      <div
                        key={artifact.artifactId || `artifact-${index}`}
                        className="inline-block mr-2 mb-2"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={artifactSummary?.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-sm text-xs text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                            >
                              <BookOpen className="w-3 h-3 text-gray-500 dark:text-muted-foreground" />
                              <span className="max-w-32 truncate">
                                {artifactSummary?.title || artifact.name}
                              </span>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="p-2">
                              <div className="font-medium text-sm mb-1 text-popover-foreground">
                                {artifact.name}
                              </div>
                              <div className="text-xs text-muted-foreground leading-relaxed">
                                {artifact.description}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IkpMessage;
