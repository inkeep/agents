import type { Node } from '@xyflow/react';
import { Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { GenericCheckbox } from '@/components/form/generic-checkbox';
import { GenericCodeEditor } from '@/components/form/generic-code-editor';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { GenericJsonSchemaEditor } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
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
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useNodeEditor } from '@/hooks/use-node-editor';
import type { FunctionToolNodeData } from '../../configuration/node-types';

interface FunctionToolNodeEditorProps {
  selectedNode: Node<FunctionToolNodeData>;
}

export function FunctionToolNodeEditor({ selectedNode }: FunctionToolNodeEditorProps) {
  const { deleteNode } = useNodeEditor({ selectedNodeId: selectedNode.id });

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

  const [isWriteWithAIDialogOpen, setIsWriteWithAIDialogOpen] = useState(false);
  const [writeWithAIInstructions, setWriteWithAIInstructions] = useState('');

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
      <GenericCodeEditor
        control={form.control}
        name={path('executeCode')}
        label="Code"
        placeholder={`async function execute({ param1, param2 }) {
  // Your function logic here
  const result = await doSomething(param1, param2);
  return {
    success: true,
    data: result
  };
}`}
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
        description="JavaScript function code to be executed by the tool. The function will receive arguments based on the input schema and should return a result."
      />
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
      <GenericCheckbox
        control={form.control}
        name={path('tempToolPolicies.*.needsApproval')}
        label="Require approval"
        description={
          <>
            When enabled, the agent will pause and request user approval before running this
            function tool.{' '}
            <a
              href="https://docs.inkeep.com/visual-builder/tools/tool-approvals"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Learn more
            </a>
          </>
        }
      />
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
