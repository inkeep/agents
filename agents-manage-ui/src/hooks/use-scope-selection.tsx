'use client';

import { useCallback, useState } from 'react';
import type { CredentialScope } from '@/components/mcp-servers/form/validation';
import { ScopeSelectionDialog } from '@/components/mcp-servers/selection/scope-selection-dialog';

export interface UseScopeSelectionOptions<T = void> {
  /**
   * Called when the user confirms their scope selection.
   * Receives the selected scope and any context data passed to requestScopeSelection.
   */
  onConfirm: (scope: CredentialScope, context: T) => void | Promise<void>;
}

export interface UseScopeSelectionReturn<T = void> {
  /**
   * Opens the scope selection dialog.
   * @param name - Display name for the dialog (e.g., server or tool name)
   * @param context - Optional context data to pass through to onConfirm
   */
  requestScopeSelection: (name: string, context: T) => void;

  /**
   * Whether the dialog is currently open
   */
  isOpen: boolean;

  /**
   * Closes the dialog without confirming
   */
  close: () => void;

  /**
   * The dialog component to render. Must be included in your JSX.
   */
  ScopeDialog: React.ReactNode;
}

/**
 * Hook for managing credential scope selection with a dialog.
 *
 * @example
 * ```tsx
 * const { requestScopeSelection, ScopeDialog } = useScopeSelection({
 *   onConfirm: (scope, toolId) => {
 *     console.log(`Selected scope ${scope} for tool ${toolId}`);
 *   },
 * });
 *
 * return (
 *   <>
 *     <Button onClick={() => requestScopeSelection('My Tool', 'tool-123')}>
 *       Connect
 *     </Button>
 *     {ScopeDialog}
 *   </>
 * );
 * ```
 */
export function useScopeSelection<T = void>(
  options: UseScopeSelectionOptions<T>
): UseScopeSelectionReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingContext, setPendingContext] = useState<T | null>(null);

  const requestScopeSelection = useCallback((name: string, context: T) => {
    setPendingName(name);
    setPendingContext(context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPendingName('');
    setPendingContext(null);
  }, []);

  const handleConfirm = useCallback(
    async (scope: CredentialScope) => {
      if (pendingContext !== null) {
        await options.onConfirm(scope, pendingContext);
      }
      close();
    },
    [options, pendingContext, close]
  );

  const ScopeDialog = (
    <ScopeSelectionDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      serverName={pendingName}
      onConfirm={handleConfirm}
    />
  );

  return {
    requestScopeSelection,
    isOpen,
    close,
    ScopeDialog,
  };
}
