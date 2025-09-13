'use client';

import { AlertCircle, ChevronDown, ChevronRight, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSidePane } from '@/hooks/use-side-pane';
import type { GraphErrorSummary, ProcessedGraphError } from '@/lib/utils/graph-error-parser';

interface GraphErrorSummaryProps {
  errorSummary: GraphErrorSummary;
  onClose: () => void;
  onNavigateToNode?: (nodeId: string) => void;
  onNavigateToEdge?: (edgeId: string) => void;
}

interface ErrorGroupProps {
  title: string;
  errors: ProcessedGraphError[];
  icon: React.ReactNode;
  onNavigate?: (id: string) => void;
  getItemLabel?: (error: ProcessedGraphError) => string;
}

function ErrorGroup({ title, errors, icon, onNavigate, getItemLabel }: ErrorGroupProps) {
  const [isOpen, setIsOpen] = useState(false); // Start collapsed by default

  if (errors.length === 0) return null;

  const groupedErrors: Record<string, ProcessedGraphError[]> = {};
  for (const error of errors) {
    const key = error.nodeId || error.edgeId || 'general';
    if (!groupedErrors[key]) groupedErrors[key] = [];
    groupedErrors[key].push(error);
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-start p-1.5 h-auto">
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs">
            {icon}
            <span className="font-medium">
              {title} ({errors.length})
            </span>
            {isOpen ? (
              <ChevronDown className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronRight className="w-3 h-3 ml-auto" />
            )}
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-4 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        {Object.entries(groupedErrors).map(([itemId, itemErrors]) => (
          <div key={itemId} className="space-y-1">
            <div className="flex items-center gap-1.5">
              {getItemLabel && (
                <span className="text-xs font-medium text-foreground truncate">
                  {getItemLabel(itemErrors[0])}
                </span>
              )}
              {onNavigate && itemId !== 'general' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(itemId)}
                  className="h-5 px-1.5 text-xs"
                >
                  Go to
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {itemErrors.map((error, index) => (
                <div
                  key={`${itemId}-${index}`}
                  className="text-xs text-red-700 dark:text-red-300 bg-red-50/90 dark:bg-red-950/40 p-2 rounded border border-red-200 dark:border-red-700"
                >
                  <div className="font-medium mb-1">{error.field}:</div>
                  <div className="text-xs leading-relaxed">{error.message}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GraphErrorSummaryComponent({
  errorSummary,
  onClose,
  onNavigateToNode,
  onNavigateToEdge,
}: GraphErrorSummaryProps) {
  const { setQueryState } = useSidePane();

  const handleNavigateToNode = (nodeId: string) => {
    setQueryState({
      pane: 'node',
      nodeId,
      edgeId: null,
    });
    onNavigateToNode?.(nodeId);
  };

  const handleNavigateToEdge = (edgeId: string) => {
    setQueryState({
      pane: 'edge',
      nodeId: null,
      edgeId,
    });
    onNavigateToEdge?.(edgeId);
  };

  const nodeErrors = Object.values(errorSummary.nodeErrors).flat();
  const edgeErrors = Object.values(errorSummary.edgeErrors).flat();
  const graphErrors = errorSummary.graphErrors;

  const getAgentLabel = (error: ProcessedGraphError) => {
    // You might want to get the actual agent name from the graph data
    return `Agent (${error.nodeId})`;
  };

  const getConnectionLabel = (error: ProcessedGraphError) => {
    return `Connection (${error.edgeId})`;
  };

  return (
    <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 backdrop-blur-sm shadow-xl gap-2 py-4 max-h-[80vh] animate-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="px-3">
        <CardTitle className="flex items-center justify-between text-red-700 dark:text-red-400 text-sm">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>Validation Errors ({errorSummary.totalErrors})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="w-3 h-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 overflow-y-auto max-h-[calc(80vh-80px)] scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        <div className="text-xs text-red-600 dark:text-red-400 mb-2">
          Fix these issues to save your graph:
        </div>

        <ErrorGroup
          title="Agent Errors"
          errors={nodeErrors}
          icon={<Zap className="w-3 h-3" />}
          onNavigate={handleNavigateToNode}
          getItemLabel={getAgentLabel}
        />

        <ErrorGroup
          title="Connection Errors"
          errors={edgeErrors}
          icon={<div className="w-3 h-3 border rounded-full" />}
          onNavigate={handleNavigateToEdge}
          getItemLabel={getConnectionLabel}
        />

        <ErrorGroup
          title="Graph Configuration Errors"
          errors={graphErrors}
          icon={<AlertCircle className="w-3 h-3" />}
        />

        <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
          <div className="text-xs text-red-500 dark:text-red-400">
            💡 Click "Go to" buttons to navigate to issues
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Export with the expected name for compatibility
export { GraphErrorSummaryComponent as GraphErrorSummary };
