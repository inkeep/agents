'use client';

import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

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

// Validation functions
const validateDisplayName = (name: string): string | null => {
  if (!name.trim()) return null;
  if (name.length > 100) return 'Display name must be less than 100 characters';
  if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
    return 'Display name can only contain letters, numbers, hyphens, and underscores';
  }
  return null;
};

const validateDescription = (desc: string): string | null => {
  if (!desc.trim()) return null;
  if (desc.length > 1000) return 'Description must be less than 1000 characters';
  return null;
};

const validateJsonSchema = (schema: string): string | null => {
  if (!schema.trim()) return null;
  try {
    const parsed = JSON.parse(schema);
    if (typeof parsed !== 'object' || parsed === null) {
      return 'Schema must be a valid JSON object';
    }
    // Basic JSON schema structure validation
    if (parsed.type && !['string', 'number', 'boolean', 'object', 'array'].includes(parsed.type)) {
      return 'Invalid schema type. Must be string, number, boolean, object, or array';
    }
    return null;
  } catch (error) {
    return `Invalid JSON syntax: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

const validateTransformation = (transformation: string): string | null => {
  if (!transformation.trim()) return null;

  // Check if it's a valid JMESPath expression or JSON object
  try {
    const parsed = JSON.parse(transformation);
    if (typeof parsed === 'object' && parsed !== null) {
      // Validate object transformation mapping
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          return 'Object transformation must map string keys to string JMESPath expressions';
        }
        if (!key.trim() || !value.trim()) {
          return 'Object transformation keys and values cannot be empty';
        }
      }
      return null;
    }
  } catch {
    // Not JSON, could be JMESPath expression
  }

  // Validate as JMESPath expression
  if (transformation.length > 500) {
    return 'JMESPath expression must be less than 500 characters';
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /\$\{.*\}/, // Template injection
    /eval\s*\(/i, // Eval calls
    /function\s*\(/i, // Function definitions
    /constructor/i, // Constructor access
    /prototype/i, // Prototype manipulation
    /__proto__/i, // Proto access
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(transformation)) {
      return `Transformation contains potentially dangerous pattern: ${pattern.source}`;
    }
  }

  return null;
};

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

  // Validation errors
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [transformationError, setTransformationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Validate fields on change
  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setDisplayNameError(validateDisplayName(value));
    setSaveError(null);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    setDescriptionError(validateDescription(value));
    setSaveError(null);
  };

  const handleSchemaChange = (value: string) => {
    setSchema(value);
    setSchemaError(validateJsonSchema(value));
    setSaveError(null);
  };

  const handleTransformationChange = (value: string) => {
    setTransformation(value);
    setTransformationError(validateTransformation(value));
    setSaveError(null);
  };

  const handleSave = () => {
    // Validate all fields
    const displayNameErr = validateDisplayName(displayName);
    const descriptionErr = validateDescription(description);
    const schemaErr = validateJsonSchema(schema);
    const transformationErr = validateTransformation(transformation);

    setDisplayNameError(displayNameErr);
    setDescriptionError(descriptionErr);
    setSchemaError(schemaErr);
    setTransformationError(transformationErr);

    // Check for any validation errors
    if (displayNameErr || descriptionErr || schemaErr || transformationErr) {
      setSaveError('Please fix the validation errors before saving.');
      return;
    }

    try {
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
          })(),
        }),
        ...(transformation.trim() && {
          transformation: (() => {
            try {
              const parsed = JSON.parse(transformation);
              return typeof parsed === 'object' ? parsed : transformation;
            } catch {
              return transformation;
            }
          })(),
        }),
      };

      onSave(newOverride);
      onOpenChange(false);

      // Reset errors on successful save
      setDisplayNameError(null);
      setDescriptionError(null);
      setSchemaError(null);
      setTransformationError(null);
      setSaveError(null);
    } catch (error) {
      setSaveError(
        `Failed to save override: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const hasChanges =
    displayName.trim() || description.trim() || schema.trim() || transformation.trim();

  const hasErrors = Boolean(
    displayNameError || descriptionError || schemaError || transformationError
  );

  const isValid = hasChanges && !hasErrors;

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

        {/* Error Alert */}
        {saveError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Display Name Override */}
          <div>
            <Label htmlFor="displayName">Display Name (optional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder={originalTool?.name || toolName}
              className={displayNameError ? 'border-red-500 focus:border-red-500' : ''}
            />
            {displayNameError ? (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangleIcon className="h-3 w-3" />
                {displayNameError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Override the tool name shown to the agent
              </p>
            )}
          </div>

          {/* Description Override */}
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder={originalTool?.description || 'Enter a custom description...'}
              rows={3}
              className={descriptionError ? 'border-red-500 focus:border-red-500' : ''}
            />
            {descriptionError ? (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangleIcon className="h-3 w-3" />
                {descriptionError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Override the tool description shown to the agent
              </p>
            )}
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
              <div className={`border rounded-lg p-4 ${schemaError ? 'border-red-500' : ''}`}>
                <JsonSchemaBuilder value={schema} onChange={handleSchemaChange} />
              </div>
            ) : (
              <ExpandableJsonEditor
                name="schema-override"
                value={schema}
                onChange={handleSchemaChange}
                placeholder='{"param1": {"type": "string", "description": "Parameter 1"}}'
                className={schemaError ? 'border-red-500' : ''}
              />
            )}

            {schemaError ? (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangleIcon className="h-3 w-3" />
                {schemaError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {useVisualBuilder
                  ? 'Build a simplified schema visually - toggle JSON mode for raw editing'
                  : 'Define simplified input parameters as JSON schema'}
              </p>
            )}
          </div>

          {/* Transformation Override */}
          <div>
            <Label htmlFor="transformation">Transformation (optional)</Label>
            <ExpandableJsonEditor
              name="transformation-override"
              value={transformation}
              onChange={handleTransformationChange}
              placeholder='Example JMESPath: "input.data" or Object mapping: {"param1": "data.field1", "param2": "data.field2"}'
              className={transformationError ? 'border-red-500' : ''}
            />
            {transformationError ? (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangleIcon className="h-3 w-3" />
                {transformationError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Transform tool arguments using JMESPath expressions or object mappings
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || hasErrors}
            className={isValid ? 'bg-green-600 hover:bg-green-700' : undefined}
          >
            {isValid && <CheckCircleIcon className="h-4 w-4 mr-1" />}
            Save Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
