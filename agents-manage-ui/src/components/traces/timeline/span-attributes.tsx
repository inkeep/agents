'use client';

import { JsonEditorWithCopy } from '@/components/editors/json-editor-with-copy';
import { cn } from '@/lib/utils';

// Constants for attribute categorization and sorting
const PINNED_ATTRIBUTE_KEYS = [
  'name',
  'spanID',
  'parentSpanID',
  'traceID',
  'tenant.id',
  'project.id',
  'agent.id',
  'conversation.id',
  'target.tenant.id',
  'target.project.id',
  'target.agent.id',
] as const;

// Type definitions
type SpanAttribute = string | number | boolean | object | null | undefined;
type AttributeMap = Record<string, SpanAttribute>;

interface SpanAttributesProps {
  span: AttributeMap;
  className?: string;
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

  const remainingKeys = Object.keys(attributes)
    .filter((key) => !PINNED_ATTRIBUTE_KEYS.includes(key as any))
    .sort();

  remainingKeys.forEach((key) => {
    remainingAttributes[key] = attributes[key];
  });

  return { ...pinnedAttributes, ...remainingAttributes };
}

function filterProcessAttributes(span: AttributeMap): AttributeMap {
  const PROCESS_ATTRIBUTE_PREFIXES = ['host.', 'process.', 'signoz.'] as const;
  const filteredAttributes: AttributeMap = {};

  Object.entries(span).forEach(([key, value]) => {
    const isProcessAttribute = PROCESS_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix));
    if (!isProcessAttribute) {
      filteredAttributes[key] = value;
    }
  });

  return filteredAttributes;
}

/**
 * Main component for displaying span attributes with proper categorization and sorting
 */
export function SpanAttributes({ span, className }: SpanAttributesProps) {
  const filteredAttributes = filterProcessAttributes(span);
  const sortedAttributes = sortAttributes(filteredAttributes);
  const hasAttributes = Object.keys(sortedAttributes).length > 0;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main span attributes */}
      {hasAttributes && (
        <JsonEditorWithCopy
          value={JSON.stringify(sortedAttributes, null, 2)}
          uri="advanced-span-attributes.json"
          title="Advanced Span Attributes"
        />
      )}

      {/* Empty state */}
      {!hasAttributes && (
        <div className="text-center py-4 text-xs text-muted-foreground">
          No span attributes available
        </div>
      )}
    </div>
  );
}
