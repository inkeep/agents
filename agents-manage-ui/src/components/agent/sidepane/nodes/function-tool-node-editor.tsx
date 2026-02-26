import type { Node } from '@xyflow/react';
import { Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { ExpandableCodeEditor } from '@/components/editors/expandable-code-editor';
import { JsonSchemaEditor } from '@/components/editors/json-schema-editor';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useCopilotContext } from '@/contexts/copilot';
import { useProjectPermissions } from '@/contexts/project';
import { useNodeEditor } from '@/hooks/use-node-editor';
import type { FunctionToolNodeData } from '../../configuration/node-types';
import { InputField } from '../form-components/input';
import { TextareaField } from '../form-components/text-area';

interface FunctionToolNodeEditorProps {
  selectedNode: Node<FunctionToolNodeData>;
}

export function FunctionToolNodeEditor({ selectedNode }: FunctionToolNodeEditorProps) {
  const { getFieldError, setFieldRef, updatePath, deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
  });

  const { canEdit } = useProjectPermissions();
  const { chatFunctionsRef, openCopilot, isCopilotConfigured } = useCopilotContext();

  const nodeData = selectedNode.data;

  const [isWriteWithAIDialogOpen, setIsWriteWithAIDialogOpen] = useState(false);
  const [writeWithAIInstructions, setWriteWithAIInstructions] = useState('');

  // Local state for form fields - initialize from node data
  const [name, setName] = useState(String(nodeData.name || ''));
  const [description, setDescription] = useState(String(nodeData.description || ''));
  const [code, setCode] = useState(String(nodeData.code || ''));
  const [inputSchema, setInputSchema] = useState(() =>
    nodeData.inputSchema ? JSON.stringify(nodeData.inputSchema, null, 2) : ''
  );
  const [dependencies, setDependencies] = useState(() =>
    nodeData.dependencies ? JSON.stringify(nodeData.dependencies, null, 2) : ''
  );
  const [needsApproval, setNeedsApproval] = useState(
    !!(nodeData.tempToolPolicies?.['*']?.needsApproval ?? false)
  );

  // Sync local state with node data when node changes
  useEffect(() => {
    setName(String(nodeData.name || ''));
    setDescription(String(nodeData.description || ''));
    setCode(String(nodeData.code || ''));
    setInputSchema(nodeData.inputSchema ? JSON.stringify(nodeData.inputSchema, null, 2) : '');
    setDependencies(nodeData.dependencies ? JSON.stringify(nodeData.dependencies, null, 2) : '');
    setNeedsApproval(!!(nodeData.tempToolPolicies?.['*']?.needsApproval ?? false));
  }, [nodeData]);

  // Handle input schema changes with JSON validation
  const handleInputSchemaChange = useCallback(
    (value: string) => {
      setInputSchema(value);

      if (!value?.trim()) {
        updatePath('inputSchema', undefined);
        return;
      }

      try {
        const parsed = JSON.parse(value);
        updatePath('inputSchema', parsed);
      } catch {
        // Invalid JSON - don't update
      }
    },
    [updatePath]
  );

  // Handle dependencies changes with JSON validation
  const handleDependenciesChange = useCallback(
    (value: string) => {
      setDependencies(value);

      if (!value?.trim()) {
        updatePath('dependencies', undefined);
        return;
      }

      try {
        const parsed = JSON.parse(value);
        updatePath('dependencies', parsed);
      } catch {
        // Invalid JSON - don't update
      }
    },
    [updatePath]
  );

  // Handle name changes
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newName = e.target.value;
      setName(newName);
      updatePath('name', newName);
    },
    [updatePath]
  );

  // Handle code changes
  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      updatePath('code', value);
    },
    [updatePath]
  );

  // Handle description changes
  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newDescription = e.target.value;
      setDescription(newDescription);
      updatePath('description', newDescription);
    },
    [updatePath]
  );

  const handleWriteWithAISubmit = useCallback(() => {
    if (!chatFunctionsRef?.current) return;
    const baseMessage = `I want to update the code for the function tool "${name || 'this function tool'}".`;
    const message = writeWithAIInstructions.trim()
      ? `${baseMessage}\n\n${writeWithAIInstructions.trim()}`
      : baseMessage;
    openCopilot();
    setTimeout(() => {
      chatFunctionsRef.current?.submitMessage(message);
    }, 100);
    setIsWriteWithAIDialogOpen(false);
    setWriteWithAIInstructions('');
  }, [chatFunctionsRef, name, writeWithAIInstructions, openCopilot]);

  const canWriteWithAI = isCopilotConfigured && canEdit;

  return (
    <div className="space-y-8">
      <InputField
        ref={(el) => setFieldRef('name', el)}
        id="function-tool-name"
        name="name"
        label="Name"
        value={name}
        onChange={handleNameChange}
        placeholder="Enter function tool name..."
        error={getFieldError('name')}
        isRequired
      />
      <TextareaField
        ref={(el) => setFieldRef('description', el)}
        id="function-tool-description"
        name="description"
        label="Description"
        value={description}
        onChange={handleDescriptionChange}
        placeholder="Enter function tool description..."
        error={getFieldError('description')}
        className="max-h-32"
      />
      <div className="space-y-2">
        <ExpandableCodeEditor
          name="code"
          label="Code"
          value={code}
          onChange={handleCodeChange}
          placeholder={`async function execute({ param1, param2 }) {
  // Your function logic here
  const result = await doSomething(param1, param2);
  return {
    success: true,
    data: result
  };
}`}
          error={getFieldError('code')}
          isRequired
          actions={
            canWriteWithAI ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-xs h-6 gap-1"
                onClick={() => setIsWriteWithAIDialogOpen(true)}
              >
                <Sparkles className="size-3.5" />
                Write with AI
              </Button>
            ) : null
          }
        />
        <p className="text-xs text-muted-foreground">
          JavaScript function code to be executed by the tool. The function will receive arguments
          based on the input schema and should return a result.
        </p>
      </div>
      <Dialog open={isWriteWithAIDialogOpen} onOpenChange={setIsWriteWithAIDialogOpen}>
        <DialogContent className="max-w-2xl!">
          <DialogHeader>
            <DialogTitle>Write with AI</DialogTitle>
            <DialogDescription className="sr-only">
              Optional instructions for the copilot to update the function tool code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="write-with-ai-instructions">Instructions (optional)</Label>
              <Textarea
                id="write-with-ai-instructions"
                placeholder="e.g. use fetch to call the API and return JSON"
                value={writeWithAIInstructions}
                onChange={(e) => setWriteWithAIInstructions(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsWriteWithAIDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleWriteWithAISubmit}>
                <Sparkles className="size-4" />
                Open Copilot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="space-y-2 relative">
        <FieldLabel label="Input Schema" isRequired />
        <JsonSchemaEditor
          value={inputSchema}
          onChange={handleInputSchemaChange}
          aria-invalid={!!getFieldError('inputSchema')}
          placeholder={`{
  "type": "object",
  "properties": {
    "param1": {
      "type": "string",
      "description": "Description of parameter 1"
    },
    "param2": {
      "type": "number",
      "description": "Description of parameter 2"
    }
  },
  "required": ["param1"]
}`}
        />
        <p className="text-xs text-muted-foreground">
          JSON schema defining the parameters that the function will receive. This defines the
          structure and validation rules for the function's input arguments.
        </p>
        {getFieldError('inputSchema') && (
          <p className="text-sm text-red-600">{getFieldError('inputSchema')}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Dependencies</div>

        <StandaloneJsonEditor
          value={dependencies}
          onChange={handleDependenciesChange}
          customTemplate={`{
  "axios": "^1.6.0",
  "lodash": "^4.17.21"
}`}
          placeholder={`{
  "axios": "^1.6.0",
  "lodash": "^4.17.21"
}`}
        />
        <p className="text-xs text-muted-foreground">
          External npm packages that the function code requires. These packages will be installed
          before executing the function.
        </p>
        {getFieldError('dependencies') && (
          <p className="text-sm text-red-600">{getFieldError('dependencies')}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="function-tool-needs-approval"
            checked={needsApproval}
            onCheckedChange={(checked) => {
              const value = checked === true;
              setNeedsApproval(value);
              updatePath('tempToolPolicies', value ? { '*': { needsApproval: true } } : {});
            }}
          />
          <Label htmlFor="function-tool-needs-approval">Require approval</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, the agent will pause and request user approval before running this function
          tool.{' '}
          <a
            href="https://docs.inkeep.com/visual-builder/tools/tool-approvals"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Learn more
          </a>
        </p>
      </div>
      {canEdit && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
