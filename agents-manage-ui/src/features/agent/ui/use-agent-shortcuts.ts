import { useEffect } from 'react';
import { agentStore, useAgentActions } from '@/features/agent/state/use-agent-store';
import { toast } from 'sonner';

export function useAgentShortcuts() {
  const { undo, redo } = useAgentActions();

  useEffect(() => {
    function deleteSelected() {
      agentStore.setState((state) => {
        const nodesToDelete = new Set(
          state.nodes.filter((n) => n.selected && (n.deletable ?? true)).map((n) => n.id)
        );

        const unDeletableNodes = state.nodes.filter((n) => n.selected && !n.deletable);
        if (unDeletableNodes.length) {
          const formatter = new Intl.ListFormat('en', { type: 'conjunction' });
          toast.error(
            `Cannot delete default subagent ${formatter.format(unDeletableNodes.map((n) => n.id))}`
          );
        }

        const edgesRemaining = state.edges.filter(
          (e) => !e.selected && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)
        );
        const nodesRemaining = state.nodes.filter((n) => !nodesToDelete.has(n.id));
        return {
          history: [...state.history, { nodes: state.nodes, edges: state.edges }],
          nodes: nodesRemaining,
          edges: edgesRemaining,
          dirty: true,
        };
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!(e.target as HTMLElement)?.classList.contains('react-flow__node')) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Let inputs handle backspace/delete
        const target = e.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            (target as any).isContentEditable);

        if (!isEditable) {
          e.preventDefault();
          deleteSelected();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
