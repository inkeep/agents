import { useEffect } from 'react';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { isMacOs } from '@/lib/utils';

export function useAgentShortcuts() {
  const { undo, redo, deleteSelected } = useAgentActions();

  useEffect(() => {
    const isMac = isMacOs();

    const onKeyDown = (e: KeyboardEvent) => {
      const meta = isMac ? e.metaKey : e.ctrlKey;

      if (meta && e.key === 's') {
        e.preventDefault();
        const el = document.querySelector<HTMLButtonElement>('button#save-agent');
        el?.click();
        return;
      }

      const el = e.target;
      const isHtmlElement = el instanceof HTMLElement;

      if (!isHtmlElement || !el.classList.contains('react-flow__node')) {
        return;
      }

      if (meta && e.key === 'z') {
        e.preventDefault();
        const action = e.shiftKey ? redo : undo;
        action();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deleteSelected, redo, undo]);
}
