'use client';

import { Streamdown } from 'streamdown';

// Constants for attribute categorization and sorting
const PROCESS_ATTRIBUTE_PREFIXES = ['host.', 'process.', 'signoz.'] as const;
const PINNED_ATTRIBUTE_KEYS = [
  'name',
  'spanID',
  'parentSpanID',
  'traceID',
  'tenant.id',
  'project.id',
  'graph.id',
  'conversation.id',
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
    <div>
      <h3 className="text-sm font-medium mb-2">Process Attributes</h3>
      <Streamdown>{`\`\`\`json\n${JSON.stringify(processAttributes, null, 2)}\n\`\`\``}</Streamdown>
    </div>
  );
}

/**
 * Main component for displaying span attributes with proper categorization and sorting
 */
export function SpanAttributes({ span, className }: SpanAttributesProps) {
  const { processAttributes, otherAttributes, hasProcessAttributes } = separateAttributes(span);
  const sortedOtherAttributes = sortAttributes(otherAttributes);
  
  // Sort process attributes alphabetically
  const sortedProcessAttributes = Object.keys(processAttributes)
    .sort()
    .reduce((acc, key) => {
      acc[key] = processAttributes[key];
      return acc;
    }, {} as AttributeMap);
  const hasOtherAttributes = Object.keys(otherAttributes).length > 0;
  const hasAnyAttributes = hasOtherAttributes || hasProcessAttributes;

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {/* Main span attributes */}
      {hasOtherAttributes && (
        <div>
          <h3 className="text-sm font-medium mb-2">Advanced Span Attributes</h3>
          <Streamdown>{`\`\`\`json\n${JSON.stringify(sortedOtherAttributes, null, 2)}\n\`\`\``}</Streamdown>
        </div>
      )}

      {/* Process attributes section */}
      {hasProcessAttributes && (
        <ProcessAttributesSection processAttributes={sortedProcessAttributes} />
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
