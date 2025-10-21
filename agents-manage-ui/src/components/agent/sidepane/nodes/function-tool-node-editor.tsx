import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { StandaloneJsonEditor } from '@/components/form/standalone-json-editor';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNodeEditor } from '@/hooks/use-node-editor';
import type { FunctionToolNodeData } from '../../configuration/node-types';
import { ExpandableCodeEditor } from '@/components/editors/expandable-code-editor';
import { InputField, TextareaField } from './form-fields';

interface FunctionToolNodeEditorProps {
  selectedNode: Node<FunctionToolNodeData>;
}

export function FunctionToolNodeEditor({ selectedNode }: FunctionToolNodeEditorProps) {
  const { getFieldError, setFieldRef, updatePath, deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
  });

  const nodeData = selectedNode.data;

  // Local state for form fields - initialize from node data
  const [name, setName] = useState(String(nodeData.name || ''));
  const [description, setDescription] = useState(String(nodeData.description || ''));
  const [code, setCode] = useState(String(nodeData.code || ''));
  const [inputSchema, setInputSchema] = useState(
    nodeData.inputSchema ? JSON.stringify(nodeData.inputSchema, null, 2) : ''
  );
  const [dependencies, setDependencies] = useState(
    nodeData.dependencies ? JSON.stringify(nodeData.dependencies, null, 2) : ''
  );

  // Sync local state with node data when node changes
  useEffect(() => {
    setName(String(nodeData.name || ''));
    setDescription(String(nodeData.description || ''));
    setCode(String(nodeData.code || ''));
    setInputSchema(nodeData.inputSchema ? JSON.stringify(nodeData.inputSchema, null, 2) : '');
    setDependencies(nodeData.dependencies ? JSON.stringify(nodeData.dependencies, null, 2) : '');
  }, [nodeData]);

  // Handle input schema changes with JSON validation
  const handleInputSchemaChange = useCallback(
    (value: string) => {
      setInputSchema(value);

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

  return (
    <div className="space-y-6">
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
        isRequired
        maxHeight="max-h-32"
      />
      <ExpandableCodeEditor
        name="code"
        label="Code"
        value={code}
        onChange={handleCodeChange}
        placeholder="Enter function code here..."
        error={getFieldError('code')}
        isRequired
      />
      <p className="text-sm text-muted-foreground">
        JavaScript function code to be executed by the tool. The function will receive arguments
        based on the input schema and should return a result.
      </p>
      {getFieldError('code') && <p className="text-sm text-red-600">{getFieldError('code')}</p>}
      <div className="space-y-2">
        <div className="text-sm font-medium">
          Input Schema <span className="text-red-500">*</span>
        </div>
        <p className="text-sm text-muted-foreground">
          JSON schema defining the parameters that the function will receive. This defines the
          structure and validation rules for the function's input arguments.
        </p>
        <StandaloneJsonEditor
          value={inputSchema}
          onChange={handleInputSchemaChange}
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
        {getFieldError('inputSchema') && (
          <p className="text-sm text-red-600">{getFieldError('inputSchema')}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Dependencies</div>
        <p className="text-sm text-muted-foreground">
          External npm packages that the function code requires. These packages will be installed
          before executing the function.
        </p>
        <StandaloneJsonEditor
          value={dependencies}
          onChange={handleDependenciesChange}
          placeholder={`{
  "axios": "^1.6.0",
  "lodash": "^4.17.21"
}`}
        />
        {getFieldError('dependencies') && (
          <p className="text-sm text-red-600">{getFieldError('dependencies')}</p>
        )}
      </div>
      <Separator />
      <div className="flex justify-end">
        <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
