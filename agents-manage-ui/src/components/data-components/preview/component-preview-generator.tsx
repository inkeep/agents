'use client';

import { Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Streamdown } from 'streamdown';
import { CodeEditor } from '@/components/form/code-editor';
import { JsonEditor } from '@/components/form/json-editor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { updateDataComponent } from '@/lib/api/data-components';
import { DynamicComponentRenderer } from './dynamic-component-renderer';

interface ComponentPreviewGeneratorProps {
  tenantId: string;
  projectId: string;
  dataComponentId: string;
  existingPreview?: { code: string; data: Record<string, unknown> } | null;
  onPreviewChanged?: (preview: { code: string; data: Record<string, unknown> } | null) => void;
}

export function ComponentPreviewGenerator({
  tenantId,
  projectId,
  dataComponentId,
  existingPreview,
  onPreviewChanged,
}: ComponentPreviewGeneratorProps) {
  const [preview, setPreview] = useState<{ code: string; data: Record<string, unknown> } | null>(
    existingPreview || null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [streamingCode, setStreamingCode] = useState<string>('');
  const [isComplete, setIsComplete] = useState(!!existingPreview);
  const [isSaved, setIsSaved] = useState(!!existingPreview);

  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  const generatePreview = async () => {
    setIsGenerating(true);
    setPreview(null);
    setStreamingCode('');
    setIsComplete(false);
    setIsSaved(false);

    try {
      const baseUrl =
        typeof window !== 'undefined'
          ? PUBLIC_INKEEP_AGENTS_MANAGE_API_URL
          : 'http://localhost:3002';
      const url = `${baseUrl}/tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}/generate-preview`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastValidObject: { code: string; data: Record<string, unknown> } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              lastValidObject = parsed;
              if (parsed.code) {
                setStreamingCode(parsed.code);
              }
            } catch (error) {
              console.warn('Failed to parse line:', line, error);
            }
          }
        }
      }

      if (lastValidObject) {
        setPreview(lastValidObject);
        setIsComplete(true);
        onPreviewChanged?.(lastValidObject);
        toast.success('Component preview generated!');
      } else {
        throw new Error('No valid preview generated');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
      setIsComplete(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeletePreview = async () => {
    setIsDeleting(true);
    try {
      await updateDataComponent(tenantId, projectId, {
        id: dataComponentId,
        preview: null,
      });
      setPreview(null);
      setIsSaved(false);
      onPreviewChanged?.(null);
      toast.success('Preview deleted');
    } catch (error) {
      console.error('Error deleting preview:', error);
      toast.error('Failed to delete preview');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasPreview = preview !== null && (preview.code?.trim().length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Component Preview</h3>
          <p className="text-sm text-muted-foreground">
            Generate a React/Tailwind component based on your schema
          </p>
        </div>
        <div className="flex gap-2">
          {!hasPreview && (
            <Button onClick={generatePreview} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          )}
          {hasPreview && (
            <>
              <Button
                variant="outline"
                onClick={generatePreview}
                disabled={isDeleting || isGenerating}
                className="gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </>
                )}
              </Button>
              {isSaved && (
                <Button
                  variant="destructive"
                  onClick={handleDeletePreview}
                  disabled={isDeleting || isGenerating}
                  size="icon"
                  title="Delete preview"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isGenerating && streamingCode && (
        <Streamdown
          isAnimating
          className="[&_[data-code-block-header=true]]:hidden [&_pre]:bg-muted/40!"
        >{`\`\`\`jsx\n${streamingCode}`}</Streamdown>
      )}

      {hasPreview && !isGenerating && isComplete && preview && (
        <Tabs defaultValue="preview" className="w-full">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="data">Sample Data</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <Card className="p-6">
              <DynamicComponentRenderer code={preview.code} props={preview.data} />
            </Card>
          </TabsContent>
          <TabsContent value="code">
            <CodeEditor
              value={preview.code}
              onChange={(newCode) => {
                const updatedPreview = { ...preview, code: newCode };
                setPreview(updatedPreview);
                onPreviewChanged?.(updatedPreview);
              }}
              language="jsx"
            />
          </TabsContent>
          <TabsContent value="data">
            <JsonEditor
              value={JSON.stringify(preview.data, null, 2)}
              onChange={(newData) => {
                try {
                  const parsedData = JSON.parse(newData);
                  const updatedPreview = { ...preview, data: parsedData };
                  setPreview(updatedPreview);
                  onPreviewChanged?.(updatedPreview);
                } catch {
                  // Invalid JSON, ignore
                }
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
