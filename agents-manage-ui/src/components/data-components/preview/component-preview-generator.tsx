'use client';

import { Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Streamdown } from 'streamdown';
import { CodeEditor } from '@/components/form/code-editor';
import { JsonEditor } from '@/components/form/json-editor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { updateDataComponent } from '@/lib/api/data-components';
import { DynamicComponentRenderer } from './dynamic-component-renderer';

const StyledTabsTrigger = (props: React.ComponentProps<typeof TabsTrigger>) => {
  return (
    <TabsTrigger
      {...props}
      className="bg-transparent data-[state=active]:border-primary dark:data-[state=active]:border-primary h-full rounded-none border-0 border-b-2 border-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:bg-transparent uppercase font-mono text-xs mt-0.5 pt-2"
    />
  );
};

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
  const [regenerateInstructions, setRegenerateInstructions] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const generatePreview = async (instructions?: string) => {
    setIsGenerating(true);
    setPreview(null);
    setStreamingCode('');
    setIsComplete(false);
    setIsSaved(false);

    try {
      const response = await fetch(`/api/data-components/${dataComponentId}/generate-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          projectId,
          instructions: instructions || undefined,
          existingCode: instructions ? preview?.code : undefined,
        }),
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
        toast.success('Preview generated successfully');
      } else {
        throw new Error('No valid preview generated');
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
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

  // Memoize to prevent infinite re-renders
  const stringifiedData = useMemo(
    () => (preview?.data ? JSON.stringify(preview.data, null, 2) : '{}'),
    [preview?.data]
  );

  const previewCode = useMemo(() => preview?.code || '', [preview?.code]);
  const previewData = useMemo(() => preview?.data || {}, [preview?.data]);

  const handleDataChange = useCallback(
    (newData: string) => {
      if (!preview) return;
      try {
        const parsedData = JSON.parse(newData);
        const updatedPreview = { ...preview, data: parsedData };
        setPreview(updatedPreview);
        onPreviewChanged?.(updatedPreview);
      } catch {
        // Invalid JSON, ignore
      }
    },
    [preview, onPreviewChanged]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h3 className="text-md font-medium">Component Preview</h3>
          <p className="text-sm text-muted-foreground">
            Generate a React/Tailwind component based on your schema.
          </p>
        </div>
        <div className="flex gap-2">
          {!hasPreview && (
            <Button
              onClick={() => generatePreview()}
              disabled={isGenerating}
              size="sm"
              className="gap-2"
            >
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
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isDeleting || isGenerating}
                    className="gap-2 font-mono uppercase"
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
                </PopoverTrigger>
                <PopoverContent className="w-96">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Modify Component</h4>
                      <Label htmlFor="instructions" className="text-xs text-muted-foreground">
                        Describe what you'd like to change (optional)
                      </Label>
                      <Textarea
                        id="instructions"
                        placeholder="e.g. Make it more compact, add a border, use different icons..."
                        value={regenerateInstructions}
                        onChange={(e) => setRegenerateInstructions(e.target.value)}
                        className="mt-2 min-h-[100px]"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsPopoverOpen(false);
                          setRegenerateInstructions('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setIsPopoverOpen(false);
                          await generatePreview(regenerateInstructions || undefined);
                          setRegenerateInstructions('');
                        }}
                        disabled={isGenerating}
                      >
                        {regenerateInstructions ? 'Apply Changes' : 'Regenerate'}
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {isSaved && (
                <Button
                  variant="destructive-outline"
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
        >{`\`\`\`jsx\n${streamingCode}\`\`\``}</Streamdown>
      )}
      {isGenerating && !streamingCode && (
        <Card className="p-6">
          <div className="flex flex-row items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground/70">Generating component preview...</p>
          </div>
        </Card>
      )}
      {hasPreview && !isGenerating && isComplete && preview && (
        <Card className="px-2 py-4 pt-0">
          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="bg-transparent relative rounded-none border-b p-0 w-full justify-start gap-2">
              <StyledTabsTrigger value="preview">Preview</StyledTabsTrigger>
              <StyledTabsTrigger value="code">Code</StyledTabsTrigger>
              <StyledTabsTrigger value="data">Sample Data</StyledTabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              <div className="p-4">
                <DynamicComponentRenderer code={previewCode} props={previewData} />
              </div>
            </TabsContent>
            <TabsContent value="code">
              <CodeEditor
                value={previewCode}
                onChange={(newCode) => {
                  if (!preview) return;
                  const updatedPreview = { ...preview, code: newCode };
                  setPreview(updatedPreview);
                  onPreviewChanged?.(updatedPreview);
                }}
                language="jsx"
                className="max-h-[500px] border-0 shadow-none"
              />
            </TabsContent>
            <TabsContent value="data">
              <JsonEditor
                value={stringifiedData}
                onChange={handleDataChange}
                className="max-h-[500px] border-0 shadow-none"
              />
            </TabsContent>
          </Tabs>
        </Card>
      )}
      {!hasPreview && !isGenerating && !isComplete && (
        <InfoCard>
          <p className="text-sm text-muted-foreground">No preview generated</p>
        </InfoCard>
      )}
    </div>
  );
}
