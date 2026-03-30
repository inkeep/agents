import { useEffect } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';

export function useAgentShortcuts() {
  'use memo';

  const { undo, redo } = useAgentActions();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const el = event.target;
      if (!(el instanceof HTMLElement)) {
        return;
      }
      const isReactFlowNode = el.classList.contains('react-flow__node');
      if (!isReactFlowNode) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      const isCmdZ = meta && event.key.toLowerCase() === 'z';
      if (!isCmdZ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
