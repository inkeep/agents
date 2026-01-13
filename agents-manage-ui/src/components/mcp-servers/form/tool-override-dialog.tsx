'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';

interface ToolOverrideDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  override?: {
    displayName?: string;
    description?: string;
    schema?: any;
    transformation?: string | Record<string, string>;
  };
  onSave: (override: {
    displayName?: string;
    description?: string;
    schema?: any;
    transformation?: string | Record<string, string>;
  }) => void;
  originalTool?: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
}

export function ToolOverrideDialog({
  isOpen,
  onOpenChange,
  toolName,
  override = {},
  onSave,
  originalTool,
}: ToolOverrideDialogProps) {
  const [displayName, setDisplayName] = useState(override.displayName || '');
  const [description, setDescription] = useState(override.description || '');
  const [schema, setSchema] = useState(
    override.schema ? JSON.stringify(override.schema, null, 2) : ''
  );
  const [transformation, setTransformation] = useState(
    typeof override.transformation === 'string' 
      ? override.transformation 
      : JSON.stringify(override.transformation || {}, null, 2)
  );
  const [useVisualBuilder, setUseVisualBuilder] = useState(true);

  const handleSave = () => {
    const newOverride = {
      ...(displayName.trim() && { displayName: displayName.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(schema.trim() && { 
        schema: (() => {
          try {
            return JSON.parse(schema);
          } catch {
            return schema;
          }
        })()
      }),
      ...(transformation.trim() && { 
        transformation: (() => {
          try {
            const parsed = JSON.parse(transformation);
            return typeof parsed === 'object' ? parsed : transformation;
          } catch {
            return transformation;
          }
        })()
      }),
    };

    onSave(newOverride);
    onOpenChange(false);
  };

  const hasChanges = displayName.trim() || description.trim() || 
                    schema.trim() || transformation.trim();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        size="fullscreen"
        className="!w-[90vw] !max-w-6xl max-h-[90vh] overflow-y-auto !h-auto"
      >
        <DialogHeader>
          <DialogTitle>Override Tool: {toolName}</DialogTitle>
          <DialogDescription>
            Customize how this tool appears and behaves in your agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Display Name Override */}
          <div>
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={originalTool?.name || toolName}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Override the tool name shown to the agent
            </p>
          </div>

          {/* Description Override */}
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={originalTool?.description || "Enter a custom description..."}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Override the tool description shown to the agent
            </p>
          </div>

          {/* Schema Override */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Schema Override (optional)</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="json-mode" className="text-xs">
                  JSON
                </Label>
                <Switch
                  id="json-mode"
                  checked={!useVisualBuilder}
                  onCheckedChange={(checked) => setUseVisualBuilder(!checked)}
                />
              </div>
            </div>
            
            {useVisualBuilder ? (
              <div className="border rounded-lg p-4">
                <JsonSchemaBuilder
                  value={schema}
                  onChange={setSchema}
                />
              </div>
            ) : (
              <ExpandableJsonEditor
                name="schema-override"
                value={schema}
                onChange={setSchema}
                placeholder='{"param1": {"type": "string", "description": "Parameter 1"}}'
              />
            )}
            
            <p className="text-xs text-muted-foreground mt-1">
              {useVisualBuilder 
                ? "Build a simplified schema visually - toggle JSON mode for raw editing"
                : "Define simplified input parameters as JSON schema"
              }
            </p>
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!hasChanges}>
            Save Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}