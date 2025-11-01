'use client';

import { Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Streamdown } from 'streamdown';
import { CodeEditor } from '@/components/editors/code-editor';
import { JsonEditor } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { updateDataComponent } from '@/lib/api/data-components';
import { cn } from '@/lib/utils';
import { DynamicComponentRenderer } from './dynamic-component-renderer';

export const StyledTabsTrigger = (props: React.ComponentProps<typeof TabsTrigger>) => {
  return (
    <TabsTrigger
      {...props}
      className={cn(
        'bg-transparent data-[state=active]:border-primary dark:data-[state=active]:border-primary h-full rounded-none border-0 border-b-2 border-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:bg-transparent uppercase font-mono text-xs mt-0.5 pt-2',
        props.className
      )}
    />
  );
};

interface ComponentPreviewGeneratorProps {
  tenantId: string;
  projectId: string;
  dataComponentId: string;
  existingRender?: { component: string; mockData: Record<string, unknown> } | null;
  onRenderChanged?: (
    render: { component: string; mockData: Record<string, unknown> } | null
  ) => void;
}

export function ComponentRenderGenerator({
  tenantId,
  projectId,
  dataComponentId,
  existingRender,
  onRenderChanged,
}: ComponentPreviewGeneratorProps) {
  const [render, setRender] = useState<{
    component: string;
    mockData: Record<string, unknown>;
  } | null>(existingRender || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [streamingCode, setStreamingCode] = useState<string>('');
  const [isComplete, setIsComplete] = useState(!!existingRender);
  const [isSaved, setIsSaved] = useState(!!existingRender);
  const [regenerateInstructions, setRegenerateInstructions] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const generatePreview = async (instructions?: string) => {
    setIsGenerating(true);
    setRender(null);
    setStreamingCode('');
    setIsComplete(false);
    setIsSaved(false);

    try {
      const response = await fetch(`/api/data-components/${dataComponentId}/generate-render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          projectId,
          instructions: instructions || undefined,
          existingCode: instructions ? render?.component : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate render');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastValidObject: { component: string; mockData: Record<string, unknown> } | null = null;

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
              if (parsed.component) {
                setStreamingCode(parsed.component);
              }
            } catch (error) {
              console.warn('Failed to parse line:', line, error);
            }
          }
        }
      }

      if (lastValidObject) {
        setRender(lastValidObject);
        setIsComplete(true);
        onRenderChanged?.(lastValidObject);
        toast.success('Render generated successfully');
      } else {
        throw new Error('No valid render generated');
      }
    } catch (error) {
      console.error('Failed to generate render:', error);
      toast.error('Failed to generate render');
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
        render: null,
      });
      setRender(null);
      setIsSaved(false);
      onRenderChanged?.(null);
      toast.success('Render deleted');
    } catch (error) {
      console.error('Error deleting render:', error);
      toast.error('Failed to delete render');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasRender = render !== null && (render.component?.trim().length ?? 0) > 0;

  // Memoize to prevent infinite re-renders
  const stringifiedData = useMemo(
    () => (render?.mockData ? JSON.stringify(render.mockData, null, 2) : '{}'),
    [render?.mockData]
  );

  const renderCode = useMemo(() => render?.component || '', [render?.component]);
  const renderData = useMemo(() => render?.mockData || {}, [render?.mockData]);

  const handleDataChange = useCallback(
    (newData: string) => {
      if (!render) return;
      try {
        const parsedData = JSON.parse(newData);
        const updatedRender = { ...render, mockData: parsedData };
        setRender(updatedRender);
        onRenderChanged?.(updatedRender);
      } catch {
        // Invalid JSON, ignore
      }
    },
    [render, onRenderChanged]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h3 className="text-md font-medium">Component Renderer</h3>
          <p className="text-sm text-muted-foreground">
            Generate a React/Tailwind component based on your schema.
          </p>
        </div>
        <div className="flex gap-2">
          {!hasRender && (
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
          {hasRender && (
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
                  title="Delete render"
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
            <p className="text-sm text-muted-foreground/70">Generating component render...</p>
          </div>
        </Card>
      )}
      {hasRender && !isGenerating && isComplete && render && (
        <Card className="px-2 py-4 pt-0">
          <Tabs defaultValue="render" className="w-full">
            <TabsList className="bg-transparent relative rounded-none border-b p-0 w-full justify-start gap-2">
              <StyledTabsTrigger value="render">Render</StyledTabsTrigger>
              <StyledTabsTrigger value="code">Code</StyledTabsTrigger>
              <StyledTabsTrigger value="data">Sample Data</StyledTabsTrigger>
            </TabsList>

            <TabsContent value="render">
              <div className="p-4">
                <DynamicComponentRenderer code={renderCode} props={renderData} />
              </div>
            </TabsContent>
            <TabsContent value="code">
              <CodeEditor
                value={renderCode}
                onChange={(newCode) => {
                  if (!render) return;
                  const updatedRender = { ...render, component: newCode };
                  setRender(updatedRender);
                  onRenderChanged?.(updatedRender);
                }}
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
      {!hasRender && !isGenerating && !isComplete && (
        <InfoCard>
          <p className="text-sm text-muted-foreground">No render generated</p>
        </InfoCard>
      )}
    </div>
  );
}
