import { type FC, useCallback, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { type editor, KeyCode } from 'monaco-editor';
import {
  addDecorations,
  cleanupDisposables,
  createEditor,
  getOrCreateModel,
} from '@/lib/monaco-utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import '@/lib/setup-monaco-workers';
import './json-editor-with-copy.css';
import { MONACO_THEME_NAME } from '@/constants/theme';

const handleCopyFieldValue = (model: editor.IModel) => async (e: editor.IEditorMouseEvent) => {
  const { element, position } = e.target;
  if (!element?.classList.contains('copy-button-icon') || !position) {
    return;
  }
  e.event.preventDefault();
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
      description: `Value: ${valueToCopy.length > 50 ? `${valueToCopy.slice(0, 50)}...'` : valueToCopy}`,
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
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }
    const model = getOrCreateModel({ uri, value });
    const monacoTheme = resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
    const editorInstance = createEditor(container, {
      theme: monacoTheme,
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
      if (model.isDisposed()) {
        return;
      }
      // Update height based on content
      const contentHeight = editorInstance.getContentHeight();
      if (container) {
        container.style.height = `${contentHeight}px`;
      }
    }
    // Wait for Monaco workers to initialize
    const timerId = setTimeout(() => {
      if (model.isDisposed()) {
        return;
      }
      addDecorations(editorInstance, value, ' ');
    }, 1000);

    return cleanupDisposables(
      {
        dispose() {
          clearTimeout(timerId);
        },
      },
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
      })
    );
  }, []);

  const handleCopyCode = useCallback(async () => {
    const code = ref.current?.querySelector('.monaco-scrollable-element')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  const handleDownloadCode = useCallback(() => {
    const code = ref.current?.querySelector('.monaco-scrollable-element')?.textContent ?? '';
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
    <>
      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
        {title}
        <Badge variant="sky">JSON</Badge>
      </h3>
      <div ref={ref} className="rounded-xl overflow-hidden border relative">
        <div className="absolute end-2 top-2 flex gap-1 z-1">
          <Button variant="ghost" size="icon-sm" title="Download File" onClick={handleDownloadCode}>
            <Download />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Copy Code" onClick={handleCopyCode}>
            <Copy />
          </Button>
        </div>
      </div>
    </>
  );
};
