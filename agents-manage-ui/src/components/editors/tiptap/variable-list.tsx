import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { type FC, useCallback, useState } from 'react';
import { monacoStore } from '@/features/agent/state/use-monaco-store';

export type VariableSuggestionItem = string;

interface VariableListProps extends SuggestionProps<VariableSuggestionItem> {}

export const buildVariableItems: SuggestionOptions['items'] = ({ query }) => {
  const { variableSuggestions } = monacoStore.getState();

  const normalized = query.toLowerCase();
  const entries = new Map<string, VariableSuggestionItem>();

  for (const label of variableSuggestions) {
    if (label.toLowerCase().includes(normalized)) {
      entries.set(label, label);
    }
  }

  return [...entries.values(), '$env.'];
};

export const VariableList: FC<VariableListProps> = ({ items, command }) => {
  const [open, setOpen] = useState(true);

  const selectItem = useCallback(
    (event: any) => {
      const label = (event.currentTarget as HTMLElement).dataset.label;
      command({ label });
    },
    [command]
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      // Setting modal false, so hovering on sidebar will still expand it
      modal={false}
    >
      <DropdownMenuTrigger />
      <DropdownMenuContent align="start">
        {items.length ? (
          items.map((item) => (
            <DropdownMenuItem key={item} data-label={item} onSelect={selectItem}>
              {item}
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">No suggestions</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
