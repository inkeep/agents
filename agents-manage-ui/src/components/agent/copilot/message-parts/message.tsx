import type { ComponentsConfig, Message } from '@inkeep/agents-ui/types';
import { Check, LoaderCircle } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import supersub from 'remark-supersub';
import { Streamdown } from 'streamdown';
import { DynamicComponentRenderer } from '@/components/data-components/render/dynamic-component-renderer';
import type { DataComponent } from '@/lib/api/data-components';
import { CitationBadge } from './citation-badge';
import { Citations } from './citations';
import { InlineEvent } from './inline-event';
import { ToolApproval } from './tool-approval';
import { useProcessedOperations } from './use-processed-operations';

interface IkpMessageProps {
  message: Message;
  isStreaming?: boolean;
  renderMarkdown: (text: string) => React.ReactNode;
  renderComponent: (name: string, props: any) => React.ReactNode;
  dataComponentLookup?: Record<string, DataComponent>;
}

// StreamMarkdown component that renders with inline citations and data operations
function StreamMarkdown({ parts }: { parts: any[] }) {
  const [processedParts, setProcessedParts] = useState<any[]>([]);

  // Process parts to create a mixed array of text and inline operations
  useEffect(() => {
    const processed: any[] = [];
    let currentTextChunk = '';

    for (const part of parts) {
      // Combine all text and artifact parts into continuous chunks
      if (part.type === 'text') {
        currentTextChunk += part.text || '';
      } else if (part.type === 'data-artifact') {
        // Add artifact as citation marker inline with current text (don't flush)
        const artifactData = part.data as any;
        const artifactSummary = artifactData.artifactSummary || {
          record_type: 'site',
          title: artifactData.name,
          url: undefined,
        };
        currentTextChunk += ` ^${artifactSummary?.title || artifactData.name}^`;
      } else {
        // For ANY other part type, flush the current text chunk first
        if (currentTextChunk) {
          processed.push({ type: 'text', content: currentTextChunk });
          currentTextChunk = '';
        }

        if (part.type === 'data-operation') {
          const { type } = part.data as any;

          // Only add inline operations for non-top-level operations
          const isTopLevelOperation = [
            'agent_initializing',
            'agent_ready',
            'completion',
            'error',
          ].includes(type);

          if (!isTopLevelOperation) {
            // Add the inline operation
            processed.push({ type: 'inline-operation', operation: part.data });
          }
        } else if (part.type === 'data-summary') {
          // Handle data-summary events as inline operations
          processed.push({
            type: 'inline-operation',
            operation: { type: 'data-summary', ...part.data },
          });
        }
      }
    }

    // Add any remaining text
    if (currentTextChunk) {
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
        }
        if (part.type === 'inline-operation') {
          const isLast = inlineOpIndex === inlineOperations.length - 1;
          inlineOpIndex++;
          return <InlineEvent key={index} operation={part.operation} isLast={isLast} />;
        }
        return null;
      })}
    </div>
  );
}

export const IkpMessageComponent: FC<IkpMessageProps> = ({
  message,
  isStreaming = false,
  renderMarkdown: _renderMarkdown,
  dataComponentLookup = {},
}) => {
  const { operations, textContent, artifacts } = useProcessedOperations(message.parts);

  // Just use operations in chronological order
  const displayOperations = operations;

  if (message.role === 'user') {
    return (
      <div>
        <div>
          <p className="text-sm">{textContent}</p>
        </div>
      </div>
    );
  }

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
                  <div className="flex items-center gap-3 h-auto w-full">
                    <LoaderCircle className="w-4 h-4 text-gray-400 dark:text-muted-foreground animate-spin" />
                    <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">
                      {' '}
                      Processing...
                    </span>

                    {/* <LoadingIndicator /> */}
                  </div>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-gray-500 dark:text-muted-foreground" />
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
              {/* Render parts in their actual order - PROPERLY INTERLEAVED! */}
              {(() => {
                const groupedParts: any[] = [];
                let currentTextGroup: any[] = [];

                // Group consecutive text parts AND artifacts together
                for (let i = 0; i < message.parts.length; i++) {
                  const part = message.parts[i];

                  if (
                    part.type === 'text' ||
                    part.type === 'data-artifact' || // Include artifacts in text groups!
                    (part.type === 'data-component' && part.data.type === 'text')
                  ) {
                    currentTextGroup.push(part);
                  } else {
                    // Non-text part - flush current text group and add the non-text part
                    if (currentTextGroup.length > 0) {
                      groupedParts.push({ type: 'text-group', parts: currentTextGroup });
                      currentTextGroup = [];
                    }
                    groupedParts.push(part);
                  }
                }

                // Don't forget the last text group
                if (currentTextGroup.length > 0) {
                  groupedParts.push({ type: 'text-group', parts: currentTextGroup });
                }

                return groupedParts.map((group, index) => {
                  if (group.type === 'text-group') {
                    // Render all text parts in this group together
                    return (
                      <div key={`text-group-${index}`}>
                        <StreamMarkdown parts={group.parts} />
                      </div>
                    );
                  }
                  if (group.type === 'data-component') {
                    const dataComponentId = group.data.id;
                    const dataComponent = dataComponentId
                      ? dataComponentLookup[dataComponentId]
                      : undefined;
                    const hasRender = dataComponent?.render?.component;

                    return (
                      <div
                        key={`component-${index}`}
                        className="my-2 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden"
                      >
                        <div className="bg-gray-50 dark:bg-muted px-3 py-1.5 border-b border-gray-200 dark:border-border flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                            <span className="text-xs font-medium text-gray-700 dark:text-foreground">
                              {group.data.name || 'Unnamed'}
                            </span>
                          </div>
                        </div>
                        <div className="p-3">
                          {hasRender && dataComponent.render ? (
                            <DynamicComponentRenderer
                              code={dataComponent.render.component}
                              props={group.data.props || {}}
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-muted-foreground font-mono">
                              {JSON.stringify(group.data.props, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (group.type === 'data-operation') {
                    if (group.data.type === 'tool_call') {
                      return (
                        <div key={`operation-${index}`}>
                          <StreamMarkdown parts={[group]} />

                          {group.data.details.data.needsApproval && (
                            <ToolApproval data={group.data} />
                          )}
                        </div>
                      );
                    }

                    // Handle inline operations in order
                    return (
                      <div key={`operation-${index}`}>
                        <StreamMarkdown parts={[group]} />
                      </div>
                    );
                  }
                  if (group.type === 'data-summary') {
                    // Handle inline summaries in order
                    return (
                      <div key={`summary-${index}`}>
                        <StreamMarkdown parts={[group]} />
                      </div>
                    );
                  }
                  return null;
                });
              })()}
            </div>

            {/* Source badges */}
            {artifacts.length > 0 && <Citations artifacts={artifacts} />}
          </div>
        )}
      </div>
    </div>
  );
};

export const IkpMessage: ComponentsConfig<Record<string, unknown>>['IkpMessage'] = (props) => {
  const { message, renderMarkdown, renderComponent } = props;

  const lastPart = message.parts[message.parts.length - 1];
  const isStreaming = !(
    lastPart?.type === 'data-operation' && lastPart?.data?.type === 'completion'
  );

  return (
    <div>
      <IkpMessageComponent
        message={message as any}
        isStreaming={isStreaming}
        renderMarkdown={renderMarkdown}
        renderComponent={renderComponent}
      />
    </div>
  );
};
