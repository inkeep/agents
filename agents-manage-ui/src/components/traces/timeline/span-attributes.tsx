'use client';

import { useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import {
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
  MONACO_THEME,
} from '@/lib/monaco-utils';
import { cn } from '@/lib/utils';
import '@/lib/setup-monaco-workers';
import { editor, KeyCode } from 'monaco-editor';
import { useTheme } from 'next-themes';

// Add CSS for copy button decorations
const copyButtonStyles = `
  .copy-button-decoration {
    cursor: pointer !important;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }
  .copy-button-decoration:hover {
    opacity: 1;
  }
  .copy-button-decoration.copied {
    opacity: 1;
    color: #10b981 !important;
  }
  .copy-button-icon {
    font-size: 14px !important;
    margin-left: 4px !important;
    opacity: 0 !important;
    transition: opacity 0.2s ease !important;
    cursor: pointer !important;
  }
  .copy-button-hover {
    opacity: 0 !important;
  }
  .copy-button-hover:hover {
    opacity: 1 !important;
  }
  .copy-button-icon.copied {
    opacity: 1 !important;
    color: #10b981 !important;
  }
  /* Show copy button when hovering over the line */
  .monaco-editor .view-line:hover .copy-button-icon {
    opacity: 0.7 !important;
  }
  .monaco-editor .view-line:hover .copy-button-icon:hover {
    opacity: 1 !important;
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
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    editor.setTheme(resolvedTheme === 'dark' ? MONACO_THEME.dark : MONACO_THEME.light);
  }, [resolvedTheme]);

  // Refresh decorations when copiedField changes
  useEffect(() => {
    if (ref.current) {
      const editorElement = ref.current.querySelector('.monaco-editor');
      if (editorElement) {
        const editorInstance = (editorElement as any).__editor;
        if (editorInstance && editorInstance.refreshDecorations) {
          editorInstance.refreshDecorations();
        }
      }
    }
  }, [copiedField]);

  useEffect(() => {
    const model = getOrCreateModel({
      uri: 'process-attributes.json',
      value: JSON.stringify(processAttributes, null, 2),
    });
    const editor = createEditor(ref, {
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
    });
    // Update height based on content
    const contentHeight = Math.min(editor.getContentHeight(), 500);
    ref.current.style.height = `${contentHeight}px`;

    // Add individual field copy buttons using decorations
    const addFieldCopyButtons = () => {
      // Check if model is still valid
      if (model.isDisposed()) {
        return;
      }

      const decorations: any[] = [];
      const lines = model.getLinesContent();

      lines.forEach((line, lineIndex) => {
        // Match JSON field patterns: "key": "value" or "key": value
        const fieldMatch = line.match(/^\s*"([^"]+)":\s*(.+?)(?:,|\s*$)/);
        if (fieldMatch) {
          const [, fieldKey, fieldValue] = fieldMatch;
          const lineNumber = lineIndex + 1;
          const endColumn = line.length;
          console.log('Found field:', fieldKey, 'on line:', lineNumber, 'line:', line);

          // Create copy button decoration - add space and icon at the end of line
          decorations.push({
            range: {
              startLineNumber: lineNumber,
              startColumn: endColumn,
              endLineNumber: lineNumber,
              endColumn: endColumn + 1,
            },
            options: {
              after: {
                content: ` ${copiedField === fieldKey ? '✅' : '📋'}`,
                inlineClassName: `copy-button-icon ${copiedField === fieldKey ? 'copied' : ''} copy-button-hover`,
                cursor: 'pointer',
              },
            },
          });
        }
      });

      console.log('Adding decorations:', decorations.length);
      editor.deltaDecorations([], decorations);
    };

    // Handle copy button clicks
    const handleCopyField = async (fieldKey: string, fieldValue: string) => {
      try {
        // Clean up the field value (remove quotes, commas, etc.)
        const cleanValue = fieldValue.replace(/^["']|["'],?\s*$/g, '');
        await navigator.clipboard.writeText(cleanValue);
        setCopiedField(fieldKey);

        // Clear previous timeout if it exists
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Set new timeout
        timeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
      } catch (err) {
        console.error('Failed to copy field:', err);
      }
    };

    // Add copy buttons after editor is ready
    setTimeout(addFieldCopyButtons, 100);

    // Refresh decorations when copiedField changes
    const refreshDecorations = () => {
      if (!model.isDisposed()) {
        addFieldCopyButtons();
      }
    };

    // Store the refresh function for later use
    (editor as any).refreshDecorations = refreshDecorations;

    // Handle mouse events for copy functionality
    const handleMouseMove = (e: any) => {
      if (model.isDisposed()) return;

      const position = e.target.position;
      if (position) {
        const line = model.getLineContent(position.lineNumber);
        const fieldMatch = line.match(/^\s*"([^"]+)":\s*(.+?)(?:,|\s*$)/);
        if (fieldMatch) {
          const [, fieldKey, fieldValue] = fieldMatch;
          // Show copy button on hover
          setShowCopyButton(true);
        }
      }
    };

    const handleMouseLeave = () => {
      setShowCopyButton(false);
    };

    // Handle clicks on copy buttons
    const handleMouseDown = (e: any) => {
      if (model.isDisposed()) return;

      const position = e.target.position;
      if (position) {
        const line = model.getLineContent(position.lineNumber);
        const fieldMatch = line.match(/^\s*"([^"]+)":\s*(.+?)(?:,|\s*$)/);
        if (fieldMatch) {
          const [, fieldKey, fieldValue] = fieldMatch;
          // Check if click is near the end of the line (where copy button is)
          const lineLength = line.length;
          if (position.column >= lineLength - 2) {
            handleCopyField(fieldKey, fieldValue);
          }
        }
      }
    };

    editor.onMouseMove(handleMouseMove);
    editor.onMouseLeave(handleMouseLeave);
    editor.onMouseDown(handleMouseDown);

    return cleanupDisposables([
      model,
      editor,
      // Disable command palette by overriding the action
      editor.addAction({
        id: 'disable-command-palette',
        label: 'Disable Command Palette',
        keybindings: [KeyCode.F1],
        run() {
          // Do nothing - this prevents the command palette from opening
        },
      }),
      // Cleanup timeout
      {
        dispose: () => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        },
      },
    ]);
  }, [processAttributes]);

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Process Attributes</h3>
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
