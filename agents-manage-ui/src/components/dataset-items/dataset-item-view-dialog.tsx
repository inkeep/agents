'use client';

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { DatasetItem } from '@/lib/api/dataset-items';

interface DatasetItemViewDialogProps {
  item: DatasetItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'object' && content !== null) {
    if ('text' in content && typeof content.text === 'string') {
      return content.text;
    }
    return JSON.stringify(content, null, 2);
  }
  return String(content || '');
};

export function DatasetItemViewDialog({ item, isOpen, onOpenChange }: DatasetItemViewDialogProps) {
  const hasInput =
    item.input &&
    typeof item.input === 'object' &&
    'messages' in item.input &&
    Array.isArray(item.input.messages) &&
    item.input.messages.length > 0;
  const hasExpectedOutput =
    item.expectedOutput && Array.isArray(item.expectedOutput) && item.expectedOutput.length > 0;
  const hasSimulationAgent = !!(
    item.simulationAgent &&
    typeof item.simulationAgent === 'object' &&
    !Array.isArray(item.simulationAgent) &&
    (item.simulationAgent.prompt || item.simulationAgent.model)
  );

  const inputMessages =
    hasInput && item.input && typeof item.input === 'object' && 'messages' in item.input
      ? item.input.messages
      : [];
  const inputHeaders =
    hasInput && item.input && typeof item.input === 'object' && 'headers' in item.input
      ? (item.input.headers as Record<string, unknown>)
      : undefined;
  const hasInputHeaders = !!(inputHeaders && Object.keys(inputHeaders).length > 0);

  const hasModel =
    !!item.simulationAgent &&
    typeof item.simulationAgent === 'object' &&
    'model' in item.simulationAgent;
  const hasStopWhen =
    !!item.simulationAgent &&
    typeof item.simulationAgent === 'object' &&
    'stopWhen' in item.simulationAgent &&
    !!item.simulationAgent.stopWhen;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Dataset Item</DialogTitle>
          <DialogDescription>
            View the input messages, expected output, and simulation configuration for this dataset
            item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Input Messages */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Input</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Messages sent to the agent, with optional headers
              </p>
            </div>

            {!hasInput || inputMessages.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-md">
                <p className="text-sm text-muted-foreground">No input messages</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inputMessages.map((message, index) => (
                  <div key={index} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Message {index + 1}</Label>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {message.role || 'user'}
                      </span>
                    </div>
                    <div className="bg-muted rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap break-words">
                        {formatContent(message.content)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Headers */}
            {hasInputHeaders && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Headers</Label>
                <div className="bg-muted rounded-md p-3">
                  <pre className="text-sm whitespace-pre-wrap break-words">
                    {JSON.stringify(inputHeaders, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Expected Output */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Expected Output</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Expected response messages from the agent (optional)
              </p>
            </div>

            {!hasExpectedOutput || !item.expectedOutput ? (
              <div className="text-center py-8 border border-dashed rounded-md">
                <p className="text-sm text-muted-foreground">No expected output</p>
              </div>
            ) : (
              <div className="space-y-3">
                {item.expectedOutput.map((message, index) => (
                  <div key={index} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Message {index + 1}</Label>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {message.role || 'assistant'}
                      </span>
                    </div>
                    <div className="bg-muted rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap break-words">
                        {formatContent(message.content)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Simulation Agent */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Simulation Agent Definition</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Configuration for simulating a multi-turn conversation (optional)
              </p>
            </div>

            {!hasSimulationAgent ? (
              <div className="text-center py-8 border border-dashed rounded-md">
                <p className="text-sm text-muted-foreground">No simulation agent configured</p>
              </div>
            ) : (
              <Collapsible defaultOpen className="border rounded-md bg-background">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
                  >
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    View Simulation Agent Configuration
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-6 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
                  {/* Prompt */}
                  {!!item.simulationAgent &&
                    typeof item.simulationAgent === 'object' &&
                    'prompt' in item.simulationAgent && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Prompt</Label>
                        <div className="bg-muted rounded-md p-3">
                          <pre className="text-sm whitespace-pre-wrap break-words">
                            {typeof item.simulationAgent.prompt === 'string'
                              ? item.simulationAgent.prompt
                              : JSON.stringify(item.simulationAgent.prompt, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  {/* Model */}
                  {hasModel && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Model</Label>
                      <div className="bg-muted rounded-md p-3">
                        <pre className="text-sm whitespace-pre-wrap break-words">
                          {JSON.stringify(
                            item.simulationAgent &&
                              typeof item.simulationAgent === 'object' &&
                              'model' in item.simulationAgent
                              ? item.simulationAgent.model
                              : null,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Stop When */}
                  {hasStopWhen && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Execution Limits</Label>
                      <div className="bg-muted rounded-md p-3">
                        <pre className="text-sm whitespace-pre-wrap break-words">
                          {JSON.stringify(
                            item.simulationAgent &&
                              typeof item.simulationAgent === 'object' &&
                              'stopWhen' in item.simulationAgent
                              ? item.simulationAgent.stopWhen
                              : null,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
