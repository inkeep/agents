'use client';

import { Streamdown } from 'streamdown';
import { CodeBubble } from '@/components/traces/timeline/bubble';
import { LabeledBlock } from '@/components/traces/timeline/blocks';

interface SpanAttributesProps {
  span: Record<string, any>;
  className?: string;
}

function separateAttributes(span: Record<string, any>) {
  const processAttributes: Record<string, any> = {};
  const otherAttributes: Record<string, any> = {};

  Object.entries(span).forEach(([key, value]) => {
    if (key.startsWith('host.') || key.startsWith('process.')) {
      processAttributes[key] = value;
    } else {
      otherAttributes[key] = value;
    }
  });

  const hasProcessAttributes = Object.keys(processAttributes).length > 0;

  return {
    processAttributes,
    otherAttributes,
    hasProcessAttributes,
  };
}

function sortAttributes(attributes: Record<string, any>) {
  const pinnedKeys = [
    'name', 
    'spanID', 
    'traceID', 
    'conversation.id', 
    'graph.id', 
    'project.id', 
    'parentSpanID', 
    'tenant.id'
  ];
  const pinnedAttributes: Record<string, any> = {};
  const remainingAttributes: Record<string, any> = {};

  // Extract pinned attributes first
  pinnedKeys.forEach(key => {
    if (key in attributes) {
      pinnedAttributes[key] = attributes[key];
    }
  });

  // Get remaining attributes and sort them alphabetically
  Object.keys(attributes)
    .filter(key => !pinnedKeys.includes(key))
    .sort()
    .forEach(key => {
      remainingAttributes[key] = attributes[key];
    });

  // Combine pinned attributes first, then sorted remaining attributes
  return { ...pinnedAttributes, ...remainingAttributes };
}

function ProcessAttributesSection({ processAttributes }: { processAttributes: Record<string, any> }) {
  return (
    <div className="border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Process Attributes
          </span>
        </div>
      </div>
      
      <div className="p-3 rounded-b-lg">
        <CodeBubble className="max-h-60 overflow-y-auto">
          <Streamdown>{`\`\`\`json\n${JSON.stringify(processAttributes, null, 2)}\n\`\`\``}</Streamdown>
        </CodeBubble>
      </div>
    </div>
  );
}

export function SpanAttributes({ span, className }: SpanAttributesProps) {
  const { processAttributes, otherAttributes, hasProcessAttributes } = separateAttributes(span);
  const sortedOtherAttributes = sortAttributes(otherAttributes);

  return (
    <div className={`space-y-3 ${className || ''}`}>
      {/* Main span attributes */}
      {Object.keys(otherAttributes).length > 0 && (
        <LabeledBlock label="Advanced Span Attributes">
          <CodeBubble className="max-h-60 overflow-y-auto">
            <Streamdown>{`\`\`\`json\n${JSON.stringify(sortedOtherAttributes, null, 2)}\n\`\`\``}</Streamdown>
          </CodeBubble>
        </LabeledBlock>
      )}

      {/* Process attributes in collapsible section */}
      {hasProcessAttributes && (
        <ProcessAttributesSection processAttributes={processAttributes} />
      )}

      {/* Fallback if no attributes at all */}
      {Object.keys(otherAttributes).length === 0 && !hasProcessAttributes && (
        <div className="text-center py-4 text-xs text-muted-foreground">
          No span attributes available
        </div>
      )}
    </div>
  );
}
