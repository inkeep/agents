import { useReactFlow } from '@xyflow/react';
import { useRef } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import type { ErrorHelpers } from './use-agent-errors';

interface UseNodeEditorOptions {
  selectedNodeId: string;
  errorHelpers?: ErrorHelpers;
}

export function useNodeEditor({ selectedNodeId, errorHelpers }: UseNodeEditorOptions) {
  const { updateNodeData, setNodes, deleteElements, getNode } = useReactFlow();
  const { markUnsaved } = useAgentActions();

  const deleteNode = () => {
    deleteElements({ nodes: [{ id: selectedNodeId }] });
  };

  const updateDefaultSubAgent = (isDefault: boolean) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === selectedNodeId) {
          return { ...node, data: { ...node.data, isDefault }, deletable: !isDefault };
        }
        if (isDefault && node.data.isDefault) {
          return { ...node, data: { ...node.data, isDefault: false }, deletable: true };
        }
        return node;
      })
    );
  };

  // Focus management for error fields
  const fieldRefs = useRef<Record<string, HTMLElement>>({});

  const setFieldRef = (fieldName: string, element: HTMLElement | null) => {
    if (element) {
      fieldRefs.current[fieldName] = element;
    } else {
      delete fieldRefs.current[fieldName];
    }
  };

  // Focus on first error field when component mounts or errors change -- this was causing issues if another input was already focused
  // useEffect(() => {
  // 	if (errorHelpers) {
  // 		const firstErrorField = errorHelpers.getFirstErrorField();
  // 		if (firstErrorField && fieldRefs.current[firstErrorField]) {
  // 			// Small delay to ensure the element is rendered
  // 			setTimeout(() => {
  // 				fieldRefs.current[firstErrorField].focus();
  // 			}, 100);
  // 		}
  // 	}
  // }, [errorHelpers]);

  // Helper function to get field error message
  const getFieldError = (fieldName: string) => {
    return errorHelpers?.getFieldErrorMessage(fieldName);
  };

  // Simple field update
  const updateField = (name: string, value: any) => {
    // Check if value actually changed before updating
    const currentNode = getNode(selectedNodeId);
    const currentValue = currentNode?.data?.[name];
    // Only update and mark dirty if the value actually changed
    if (currentValue !== value) {
      updateNodeData(selectedNodeId, { [name]: value });
      markUnsaved();
    }
  };

  // Handle input change events
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    updateField(name, value);
  };

  // Enhanced updatePath that can handle nested objects
  const updateNestedPath = (path: string, value: any, currentNodeData: any) => {
    console.log('updateNestedPath called:', { path, value, currentNodeData });
    const pathParts = path.split('.');

    if (pathParts.length === 1) {
      updateField(path, value);
    } else {
      const [parentField, ...nestedPath] = pathParts;
      // Ensure we have a valid parent object, even if it's empty
      const currentParentValue = currentNodeData?.[parentField] || {};

      const updatedParent = { ...currentParentValue } as any;
      let current = updatedParent;

      // Navigate to the correct nested location
      for (let i = 0; i < nestedPath.length - 1; i++) {
        const key = nestedPath[i];
        if (!(key in current) || current[key] === null || current[key] === undefined) {
          current[key] = {};
        }
        current = current[key];
      }

      // Set the final value
      const finalKey = nestedPath[nestedPath.length - 1];
      console.log('updateNestedPath setting:', { finalKey, value, current });
      if (value === undefined || value === null || value === '') {
        delete current[finalKey];
        if (Object.keys(updatedParent).length === 0) {
          updateField(parentField, null);
          return;
        }
      } else {
        current[finalKey] = value;
      }

      updateField(parentField, updatedParent);
    }
  };

  // Advanced path-based updates for nested objects
  const updatePath = (path: string, value: any) => {
    const currentNode = getNode(selectedNodeId);
    updateNestedPath(path, value, currentNode?.data);
  };

  return {
    // Field management
    updateField,
    updatePath,
    updateNestedPath,
    handleInputChange,
    updateDefaultSubAgent,
    deleteNode,

    // Error handling
    getFieldError,

    // Focus management
    setFieldRef,

    // Utility
    markUnsaved,
  };
}
