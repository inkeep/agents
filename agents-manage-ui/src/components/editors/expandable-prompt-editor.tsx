import { Braces } from 'lucide-react';
import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { useMonacoActions, useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

export const AddVariableAction: FC<{ uri: string; className?: string }> = ({ uri, className }) => {
  const monaco = useMonacoStore((state) => state.monaco);
  const { getEditorByUri } = useMonacoActions();

  function handleAddVariable() {
    const editor = getEditorByUri(uri);
    if (!monaco || !editor) {
      return;
    }

    const selection = editor.getSelection();
    const pos = selection ? selection.getStartPosition() : editor.getPosition();
    if (!pos) return;

    const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    editor.executeEdits('insert-template-variable', [{ range, text: '{' }]);
    editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
    editor.focus();
    editor.trigger('insert-template-variable', 'editor.action.triggerSuggest', {});
  }

  return (
    <Button
      size="sm"
      variant="link"
      className={cn('text-xs rounded-sm h-6', className)}
      type="button"
      onClick={handleAddVariable}
    >
      <Braces className="size-3.5" />
      Add variables
    </Button>
  );
};
