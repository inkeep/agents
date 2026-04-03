import { useReactFlow } from '@xyflow/react';

export function useDeleteNode(id: string) {
  const { deleteElements } = useReactFlow();
  return {
    deleteNode() {
      deleteElements({ nodes: [{ id }] });
    },
  };
}
