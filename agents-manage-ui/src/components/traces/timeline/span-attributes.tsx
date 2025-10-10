'use client';

import { cn } from '@/lib/utils';
import { JsonEditorWithCopy } from '@/components/editors/json-editor-with-copy';

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

/**
 * Separates span attributes into process-related and other attributes
 */
function separateAttributes(span: AttributeMap): SeparatedAttributes {
  const processAttributes: AttributeMap = {};
  const otherAttributes: AttributeMap = {};

  Object.entries(span).forEach(([key, value]) => {
    const isProcessAttribute = PROCESS_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix));

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
  PINNED_ATTRIBUTE_KEYS.forEach((key) => {
    if (key in attributes) {
      pinnedAttributes[key] = attributes[key];
    }
  });

  // Get remaining attributes sorted alphabetically
  const remainingKeys = Object.keys(attributes)
    .filter((key) => !PINNED_ATTRIBUTE_KEYS.includes(key as any))
    .sort();

  remainingKeys.forEach((key) => {
    remainingAttributes[key] = attributes[key];
  });

  return { ...pinnedAttributes, ...remainingAttributes };
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
    .reduce<AttributeMap>((acc, key) => {
      acc[key] = processAttributes[key];
      return acc;
    }, {});
  const hasOtherAttributes = Object.keys(otherAttributes).length > 0;
  const hasAnyAttributes = hasOtherAttributes || hasProcessAttributes;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main span attributes */}
      {hasOtherAttributes && (
        <JsonEditorWithCopy
          value={JSON.stringify(sortedOtherAttributes, null, 2)}
          uri="advanced-span-attributes.json"
          title="Advanced Span Attributes"
        />
      )}

      {/* Process attributes section */}
      {hasProcessAttributes && (
        <JsonEditorWithCopy
          value={JSON.stringify(sortedProcessAttributes, null, 2)}
          uri="process-attributes.json"
          title="Process Attributes"
        />
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
