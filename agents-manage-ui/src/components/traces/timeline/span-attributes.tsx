'use client';

import { useEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
  MONACO_THEME,
} from '@/lib/monaco-utils';
import { cn } from '@/lib/utils';
import { editor, KeyCode } from 'monaco-editor';
import { useTheme } from 'next-themes';
import { renderToString } from 'react-dom/server';
import { ClipboardCopy, SquareCheckBig } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import '@/lib/setup-monaco-workers';

// Add CSS for copy button decorations with invert filter
const copyButtonStyles = `
  .copy-button-icon {
    font-size: 14px;
    margin-left: 10px;
    opacity: 0;
    cursor: pointer;
    position: relative;
  }
  .copy-button-icon::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 16px;
    height: 16px;
    background-image: url("data:image/svg+xml,${encodeURIComponent(renderToString(<ClipboardCopy />))}");
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    filter: invert(0);
  }
  /* Dark mode - invert the icon to make it white */
  .dark .copy-button-icon::before {
    filter: invert(1);
  }
  .copy-button-icon.copied {
    opacity: 1;
  }
  .copy-button-icon.copied::before {
    background-image: url("data:image/svg+xml,${encodeURIComponent(renderToString(<SquareCheckBig stroke="#00bc7d" />))}");
    filter: none;
  }
  /* Show copy button when hovering over the entire line (including field name) */
  .view-line:hover .copy-button-icon {
    opacity: 1;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = copyButtonStyles;
  document.head.appendChild(styleSheet);
}

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
 * Renders process attributes
 */
function ProcessAttributesSection({ processAttributes }: ProcessAttributesSectionProps) {
  const ref = useRef<HTMLDivElement>(null!);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    editor.setTheme(resolvedTheme === 'dark' ? MONACO_THEME.dark : MONACO_THEME.light);
  }, [resolvedTheme]);

  useEffect(() => {
    const model = getOrCreateModel({
      uri: 'process-attributes.json',
      value: JSON.stringify(
        {
          null: null,
          number: 1,
          boolean: false,
          array: [
            true,
            {
              foo: 'bar',
            },
            [2, 'baz'],
          ],
          string: 'hello',
          emptyString: '',
        },
        null,
        2
      ),
    });
    const editorInstance = createEditor(ref, {
      model,
      readOnly: true,
      lineNumbers: 'off',
      wordWrap: 'on', // Toggle word wrap on resizing editors
      contextmenu: false, // Disable the right-click context menu
      fontSize: 12,
      padding: {
        top: 16,
        bottom: 16,
      },
      scrollbar: {
        vertical: 'hidden', // Hide vertical scrollbar
        horizontal: 'hidden', // Hide horizontal scrollbar
        useShadows: false, // Disable shadow effects
        alwaysConsumeMouseWheel: false, // Monaco grabs the mouse wheel by default
      },
    });
    // Update height based on content
    const contentHeight = editorInstance.getContentHeight();
    ref.current.style.height = `${contentHeight}px`;
    addDecorations(editorInstance, model.getValue());

    return cleanupDisposables([
      model,
      editorInstance,
      // Disable command palette by overriding the action
      editorInstance.addAction({
        id: 'disable-command-palette',
        label: 'Disable Command Palette',
        keybindings: [KeyCode.F1],
        run() {
          // Do nothing - this prevents the command palette from opening
        },
      }),
    ]);
  }, [processAttributes]);

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">
        Process Attributes <Badge variant="sky">JSON</Badge>
      </h3>
      <div ref={ref} className="rounded-xl overflow-hidden border" />
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
