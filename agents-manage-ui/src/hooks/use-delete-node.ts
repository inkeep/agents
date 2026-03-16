import { useReactFlow } from '@xyflow/react';

export function useDeleteNode(id: string) {
  'use memo';
  const { deleteElements } = useReactFlow();
  return {
    deleteNode() {
      deleteElements({ nodes: [{ id }] });
    },
  };
}
