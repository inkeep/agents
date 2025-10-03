'use client';

import { Streamdown } from 'streamdown';
import { CodeBubble } from '@/components/traces/timeline/bubble';
import { LabeledBlock } from '@/components/traces/timeline/blocks';

// Constants for attribute categorization and sorting
const PROCESS_ATTRIBUTE_PREFIXES = ['host.', 'process.'] as const;
const PINNED_ATTRIBUTE_KEYS = [
  'name',
  'spanID',
  'traceID',
  'conversation.id',
  'graph.id',
  'project.id',
  'parentSpanID',
  'tenant.id',
] as const;

// Type definitions
type SpanAttribute = string | number | boolean | object | null | undefined;
type AttributeMap = Record<string, SpanAttribute>;

interface SpanAttributesProps {
  span: AttributeMap;
  className?: string;
}

interface SeparatedAttributes {
  processAttributes: AttributeMap;
  otherAttributes: AttributeMap;
  hasProcessAttributes: boolean;
}

interface ProcessAttributesSectionProps {
  processAttributes: AttributeMap;
}

/**
 * Separates span attributes into process-related and other attributes
 */
function separateAttributes(span: AttributeMap): SeparatedAttributes {
  const processAttributes: AttributeMap = {};
  const otherAttributes: AttributeMap = {};

  Object.entries(span).forEach(([key, value]) => {
    const isProcessAttribute = PROCESS_ATTRIBUTE_PREFIXES.some(prefix => 
      key.startsWith(prefix)
    );
    
    if (isProcessAttribute) {
      processAttributes[key] = value;
    } else {
      otherAttributes[key] = value;
    }
  });

  return {
    processAttributes,
    otherAttributes,
    hasProcessAttributes: Object.keys(processAttributes).length > 0,
  };
}

/**
 * Sorts attributes with pinned keys first, then alphabetically
 */
function sortAttributes(attributes: AttributeMap): AttributeMap {
  const pinnedAttributes: AttributeMap = {};
  const remainingAttributes: AttributeMap = {};

  // Extract pinned attributes in order
  PINNED_ATTRIBUTE_KEYS.forEach(key => {
    if (key in attributes) {
      pinnedAttributes[key] = attributes[key];
    }
  });

  // Get remaining attributes sorted alphabetically
  const remainingKeys = Object.keys(attributes)
    .filter(key => !PINNED_ATTRIBUTE_KEYS.includes(key as any))
    .sort();

  remainingKeys.forEach(key => {
    remainingAttributes[key] = attributes[key];
  });

  return { ...pinnedAttributes, ...remainingAttributes };
}

/**
 * Renders process attributes
 */
function ProcessAttributesSection({ processAttributes }: ProcessAttributesSectionProps) {
  return (
    <div className="border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Process Attributes
        </span>
      </div>
      
      <div className="p-3 rounded-b-lg">
        <CodeBubble className="max-h-60 overflow-y-auto">
          <Streamdown>{`\`\`\`json\n${JSON.stringify(processAttributes, null, 2)}\n\`\`\``}</Streamdown>
        </CodeBubble>
      </div>
    </div>
  );
}

/**
 * Main component for displaying span attributes with proper categorization and sorting
 */
export function SpanAttributes({ span, className }: SpanAttributesProps) {
  const { processAttributes, otherAttributes, hasProcessAttributes } = separateAttributes(span);
  const sortedOtherAttributes = sortAttributes(otherAttributes);
  
  const hasOtherAttributes = Object.keys(otherAttributes).length > 0;
  const hasAnyAttributes = hasOtherAttributes || hasProcessAttributes;

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {/* Main span attributes */}
      {hasOtherAttributes && (
        <LabeledBlock label="Advanced Span Attributes">
          <CodeBubble className="max-h-60 overflow-y-auto">
            <Streamdown>{`\`\`\`json\n${JSON.stringify(sortedOtherAttributes, null, 2)}\n\`\`\``}</Streamdown>
          </CodeBubble>
        </LabeledBlock>
      )}

      {/* Process attributes section */}
      {hasProcessAttributes && (
        <ProcessAttributesSection processAttributes={processAttributes} />
      )}

      {/* Empty state */}
      {!hasAnyAttributes && (
        <div className="text-center py-4 text-xs text-muted-foreground">
          No span attributes available
        </div>
      )}
    </div>
  );
}
