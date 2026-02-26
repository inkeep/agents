import type { Node } from '@xyflow/react';
import { Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ExpandableCodeEditor } from '@/components/editors/expandable-code-editor';
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
import { useFieldArray, useWatch } from 'react-hook-form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { GenericJsonSchemaEditor } from '@/components/form/json-schema-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';

interface FunctionToolNodeEditorProps {
  selectedNode: Node<FunctionToolNodeData>;
}

export function FunctionToolNodeEditor({ selectedNode }: FunctionToolNodeEditorProps) {
  const { getFieldError, updatePath, deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
  });

  const { canEdit } = useProjectPermissions();
  const { chatFunctionsRef, openCopilot, isCopilotConfigured } = useCopilotContext();
  const form = useFullAgentFormContext();
  const { fields } = useFieldArray({
    control: form.control,
    name: 'functionTools',
    keyName: '_rhfKey2',
  });
  const functionToolIndex = 0; //fields.findIndex(
  // (s) => s.id === (selectedNode.data.id ?? selectedNode.id)
  // );

  const functionTool = useWatch({
    control: form.control,
    name: `functionTools.${functionToolIndex}`,
  });
  // if (functionToolIndex < 0) return null;

  const path = <K extends string>(k: K) => `functionTools.${functionToolIndex}.${k}` as const;

  const nodeData = selectedNode.data;

  const [isWriteWithAIDialogOpen, setIsWriteWithAIDialogOpen] = useState(false);
  const [writeWithAIInstructions, setWriteWithAIInstructions] = useState('');

  // Local state for form fields - initialize from node data
  const [code, setCode] = useState(String(nodeData.code || ''));
  const [needsApproval, setNeedsApproval] = useState(
    !!(nodeData.tempToolPolicies?.['*']?.needsApproval ?? false)
  );

  // Sync local state with node data when node changes
  useEffect(() => {
    setCode(String(nodeData.code || ''));
    setNeedsApproval(!!(nodeData.tempToolPolicies?.['*']?.needsApproval ?? false));
  }, [nodeData]);

  // Handle code changes
  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      updatePath('code', value);
    },
    [updatePath]
  );

  const handleWriteWithAISubmit = useCallback(() => {
    if (!chatFunctionsRef?.current) return;
    const baseMessage = `I want to update the code for the function tool "${functionTool.name || 'this function tool'}".`;
    const message = writeWithAIInstructions.trim()
      ? `${baseMessage}\n\n${writeWithAIInstructions.trim()}`
      : baseMessage;
    openCopilot();
    setTimeout(() => {
      chatFunctionsRef.current?.submitMessage(message);
    }, 100);
    setIsWriteWithAIDialogOpen(false);
    setWriteWithAIInstructions('');
  }, [chatFunctionsRef, functionTool.name, writeWithAIInstructions, openCopilot]);

  const canWriteWithAI = isCopilotConfigured && canEdit;
  console.log({ functionTool });
  return (
    <div className="space-y-8">
      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="Enter function tool name..."
        isRequired
      />
      <GenericTextarea
        control={form.control}
        name={path('description')}
        label="Description"
        placeholder="Enter function tool description..."
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
      <GenericJsonSchemaEditor
        control={form.control}
        name={path('inputSchema')}
        label="Input Schema"
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
        description="JSON schema defining the parameters that the function will receive. This defines the structure and validation rules for the function's input arguments."
        isRequired
      />
      <GenericJsonEditor
        control={form.control}
        name={path('dependencies')}
        label="Dependencies"
        placeholder={`{
  "axios": "^1.6.0",
  "lodash": "^4.17.21"
}`}
        description="External npm packages that the function code requires. These packages will be installed before executing the function."
      />
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
