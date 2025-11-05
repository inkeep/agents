import { Copy, Download } from 'lucide-react';
import type * as Monaco from 'monaco-editor';
import { type ComponentProps, type FC, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { addDecorations } from '@/lib/monaco-editor/monaco-utils';
import { JsonEditor } from './json-editor';
import './json-editor-with-copy.css';

const handleCopyFieldValue =
  (model: Monaco.editor.IModel) => async (e: Monaco.editor.IEditorMouseEvent) => {
    if (model.isDisposed()) {
      return;
    }
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

type JsonEditorWithCopyProps = Pick<ComponentProps<typeof JsonEditor>, 'uri' | 'value'> & {
  title: string;
};

export const JsonEditorWithCopy: FC<JsonEditorWithCopyProps> = ({ title, uri, value }) => {
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const monaco = useMonacoStore((state) => state.monaco);
  const handleCopyCode = useCallback(async () => {
    const code = editor?.getValue() ?? '';
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy to clipboard');
    }
  }, [editor]);

  const handleDownloadCode = useCallback(() => {
    const code = editor?.getValue() ?? '';
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
  }, [editor]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally ignore `value` changes — run only on mount
  useEffect(() => {
    const model = editor?.getModel();
    if (!monaco || !editor || !model) {
      return;
    }

    // Add copy decorations after Monaco workers initialize
    const timerId = setTimeout(() => {
      if (model.isDisposed()) {
        return;
      }
      addDecorations({
        monaco,
        editorInstance: editor,
        content: value || '',
        addedContent: ' ',
      });
    }, 1000);

    const onMouseDown = editor.onMouseDown(handleCopyFieldValue(model));

    // Cleanup on unmount or dependency change
    return () => {
      clearTimeout(timerId);
      onMouseDown.dispose();
    };
  }, [editor, monaco]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof JsonEditor>['onMount']>>(
    (editor) => {
      setEditor(editor);
    },
    []
  );

  return (
    <>
      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
        {title}
        <Badge variant="sky">JSON</Badge>
      </h3>
      <JsonEditor
        uri={uri}
        value={value}
        readOnly
        className="inkeep-readonly-monaco-editor"
        onMount={handleOnMount}
      >
        <div className="absolute end-2 top-2 flex gap-1 z-1">
          <Button variant="ghost" size="icon-sm" title="Download File" onClick={handleDownloadCode}>
            <Download />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Copy Code" onClick={handleCopyCode}>
            <Copy />
          </Button>
        </div>
      </JsonEditor>
    </>
  );
};
