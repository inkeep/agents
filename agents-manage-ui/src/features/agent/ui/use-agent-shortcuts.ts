import { useEffect } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';

export function useAgentShortcuts() {
  'use memo';

  const { undo, redo } = useAgentActions();

  useEffect(() => {
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
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
