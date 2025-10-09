import { type FC, useCallback, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { editor, KeyCode } from 'monaco-editor';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
  MONACO_THEME,
} from '@/lib/monaco-utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCopy, Copy, Download } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import '@/lib/setup-monaco-workers';

// Add CSS for copy button decorations with invert filter
const copyButtonStyles = `
  .copy-button-icon {
    font-size: 14px;
    margin-left: 10px;
    opacity: 0;
    cursor: pointer;
    position: absolute;
  }
  .copy-button-icon::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    background-image: url("data:image/svg+xml,${encodeURIComponent(
      renderToString(<ClipboardCopy />)
    )}");
    background-size: contain;
    filter: invert(0);
  }
  /* Dark mode - invert the icon to make it white */
  .dark .copy-button-icon::before {
    filter: invert(1);
  }
  /* Show copy button only when hovering over the specific line */
  .view-line:hover .copy-button-icon {
    opacity: 0.7;
  }
  /* Hide caret */
  .monaco-editor .cursor {
    display: none !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = copyButtonStyles;
  document.head.appendChild(styleSheet);
}

const handleCopyFieldValue = (model: editor.IModel) => async (e: editor.IEditorMouseEvent) => {
  const el = e.target.element;
  if (!el?.classList.contains('copy-button-icon')) {
    return;
  }
  e.event.preventDefault();
  const position = e.target.position;
  if (!position) return;
  const lineContent = model.getLineContent(position.lineNumber);
  const index = lineContent.indexOf(': ');
  const valueToCopy = lineContent
    .slice(index + 2)
    .trim()
    // Remove trailing comma if present
    .replace(/,$/, '')
    // Replace quotes in strings
    .replaceAll(/(^")|("$)/g, '');
  try {
    await navigator.clipboard.writeText(valueToCopy);
    toast.success('Copied to clipboard', {
      description: `Value: ${valueToCopy.length > 50 ? valueToCopy.slice(0, 50) + '...' : valueToCopy}`,
    });
  } catch (error) {
    console.error('Failed to copy', error);
    toast.error('Failed to copy to clipboard');
  }
};

export const JsonEditorWithCopy: FC<{ value: string; uri: `${string}.json`; title: string }> = ({
  value,
  uri,
  title,
}) => {
  const ref = useRef<HTMLDivElement>(null!);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    editor.setTheme(resolvedTheme === 'dark' ? MONACO_THEME.dark : MONACO_THEME.light);
  }, [resolvedTheme]);

  useEffect(() => {
    const model = getOrCreateModel({
      uri,
      value,
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
    function updateHeight() {
      // Update height based on content
      const contentHeight = editorInstance.getContentHeight();
      ref.current.style.height = `${contentHeight}px`;
    }
    addDecorations(editorInstance, model.getValue(), ' ');

    return cleanupDisposables([
      model,
      editorInstance,
      editorInstance.onMouseDown(handleCopyFieldValue(model)),
      editorInstance.onDidContentSizeChange(updateHeight),
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
  }, [value, uri]);

  const handleCopyCode = useCallback(async () => {
    const code = ref.current.querySelector('.monaco-scrollable-element')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  const handleDownloadCode = useCallback(() => {
    const code = ref.current.querySelector('.monaco-scrollable-element')?.textContent ?? '';
    // Create a blob with the JSON content
    const blob = new Blob([code], { type: 'application/json' });
    // Create a download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'file.json';
    // Trigger the download
    document.body.append(link);
    link.click();
    // Clean up
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('File downloaded successfully');
  }, []);

  return (
    <div>
      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
        {title}
        <Badge variant="sky">JSON</Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Download File"
          className="ml-auto"
          onClick={handleDownloadCode}
        >
          <Download />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Copy Code" onClick={handleCopyCode}>
          <Copy />
        </Button>
      </h3>
      <div ref={ref} className="rounded-xl overflow-hidden border" />
    </div>
  );
};
