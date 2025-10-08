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
import { renderToString } from 'react-dom/server';
import { ClipboardCopy, SquareCheckBig } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    editor.setTheme(resolvedTheme === 'dark' ? MONACO_THEME.dark : MONACO_THEME.light);
  }, [resolvedTheme]);

  useEffect(() => {
    const model = getOrCreateModel({
      uri: 'process-attributes.json',
      value: JSON.stringify(
        {
          array: [1, 2, 3],
          number: 2,
          foo: {
            bar: {
              baz: '',
            },
          },
          ...processAttributes,
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

    // Add individual field copy buttons using Monaco tokenization
    const addFieldCopyButtons = () => {
      // Check if model is still valid
      if (model.isDisposed()) {
        return;
      }

      const decorations: editor.IModelDeltaDecoration[] = [];
      const lines = editor.tokenize(model.getValue(), 'json');

      // Use Monaco's tokenization to find all fields
      for (const line of lines) {
        for (const token of line) {
          if (
            ![
              'delimiter.bracket.json',
              'delimiter.array.json',
              'number.json',
              'string.value.json',
            ].includes(token.type)
          ) {
            continue;
          }
          console.log(1, token);

          // Add decoration for this token
          const lineNumber = lines.indexOf(line) + 1; // Monaco is 1-indexed
          const lineContent = model.getLineContent(lineNumber);

          // Find the next token to determine the end position of current token
          const tokenIndex = line.indexOf(token);
          const nextToken = line[tokenIndex + 1];
          const tokenEndOffset = nextToken ? nextToken.offset : lineContent.length;

          // Get the actual text from the line content
          const tokenText = lineContent.substring(token.offset, tokenEndOffset);

          const decoration = {
            range: {
              startLineNumber: lineNumber,
              startColumn: tokenEndOffset + 1,
              endLineNumber: lineNumber,
              endColumn: tokenEndOffset + 2,
            },
            options: {
              after: {
                content: ' ',
                inlineClassName: 'copy-button-icon',
              },
            },
          };
          decorations.push(decoration);
          console.log(
            'Added decoration for token:',
            tokenText,
            'type:',
            token.type,
            'on line:',
            lineNumber,
            'offset:',
            token.offset,
            'endOffset:',
            tokenEndOffset
          );
        }
      }

      console.log('Adding decorations:', decorations.length, decorations);
      editorInstance.createDecorationsCollection(decorations);
    };

    setTimeout(addFieldCopyButtons, 100);
    addFieldCopyButtons();

    // Handle copy button clicks
    const handleCopyField = async (tokenText: string, tokenType: string) => {
      try {
        let contentToCopy = tokenText;
        
        // For different token types, copy different content
        if (tokenType === 'delimiter.bracket.json') {
          // For objects, we need to extract the complete object
          // This is a simplified approach - you might need more sophisticated parsing
          contentToCopy = tokenText; // Just copy the bracket for now
        } else if (tokenType === 'delimiter.array.json') {
          // For arrays, copy the bracket
          contentToCopy = tokenText;
        } else if (tokenType === 'number.json') {
          // For numbers, copy the number
          contentToCopy = tokenText;
        } else if (tokenType === 'string.value.json') {
          // For string values, copy the string (remove quotes)
          contentToCopy = tokenText.replace(/^"|"$/g, '');
        }
        
        await navigator.clipboard.writeText(contentToCopy);
        console.log('Copied:', contentToCopy, 'type:', tokenType);
      } catch (err) {
        console.error('Failed to copy field:', err);
      }
    };

    // Handle clicks on copy buttons
    const handleMouseDown = (e: editor.IEditorMouseEvent) => {
      if (model.isDisposed()) return;

      const position = e.target.position;
      if (position) {
        const lineNumber = position.lineNumber;
        const column = position.column;
        
        // Check if click is near a copy button (end of line)
        const lineContent = model.getLineContent(lineNumber);
        if (column >= lineContent.length - 1) {
          // Find the token at this position
          const lines = editor.tokenize(model.getValue(), 'json');
          const line = lines[lineNumber - 1]; // Convert to 0-indexed
          
          if (line) {
            // Find the last token that matches our filter
            for (let i = line.length - 1; i >= 0; i--) {
              const token = line[i];
              if (['delimiter.bracket.json', 'delimiter.array.json', 'number.json', 'string.value.json'].includes(token.type)) {
                const nextToken = line[i + 1];
                const tokenEndOffset = nextToken ? nextToken.offset : lineContent.length;
                const tokenText = lineContent.substring(token.offset, tokenEndOffset);
                
                handleCopyField(tokenText, token.type);
                break;
              }
            }
          }
        }
      }
    };

    editorInstance.onMouseDown(handleMouseDown);

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
