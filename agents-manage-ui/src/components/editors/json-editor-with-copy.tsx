import { type ComponentProps, type FC, useCallback, useRef } from 'react';
import { JsonEditor, type JsonEditorRef } from './json-editor';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import './json-editor-with-copy.css';

type Props = Pick<ComponentProps<typeof JsonEditor>, 'uri' | 'value'> & {
  title: string;
};

export const JsonEditorWithCopy: FC<Props> = ({ title, uri, value }) => {
  const editorRef = useRef<JsonEditorRef>(null);

  const handleCopyCode = useCallback(async () => {
    const code = editorRef.current?.editor?.getValue() ?? '';
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy', error);
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  const handleDownloadCode = useCallback(() => {
    const code = editorRef.current?.editor?.getValue() ?? '';
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
      <JsonEditor ref={editorRef} uri={uri} value={value} readOnly>
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
