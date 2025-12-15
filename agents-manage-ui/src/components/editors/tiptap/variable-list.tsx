import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import type { FC, RefObject } from 'react';
import { useCallback, useImperativeHandle, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { monacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

export type VariableListItem = string;

export type VariableListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export interface VariableListProps
  extends SuggestionProps<VariableListItem, { id: VariableListItem }> {
  ref: RefObject<VariableListRef>;
}

export const buildVariableItems: SuggestionOptions['items'] = ({ query }) => {
  const { variableSuggestions } = monacoStore.getState();

  const normalized = query.toLowerCase();
  const entries = new Map<string, VariableListItem>();

  for (const label of variableSuggestions) {
    if (label.toLowerCase().includes(normalized)) {
      entries.set(label, label);
    }
  }

  return [...entries.values(), '$env.'];
};

// TODO: figure out how to replace dropdown with shadcn and have proper scroll when scrolling in viewport and in editor view
export const VariableList2: FC<VariableListProps> = ({ items, command }) => {
  const [open, setOpen] = useState(true);

  const selectItem = useCallback(
    (event: any) => {
      const id = (event.currentTarget as HTMLElement).dataset.label as string;
      command({ id });
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
        {items.map((item) => (
          <DropdownMenuItem key={item} data-label={item} onSelect={selectItem}>
            {item}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const VariableList: FC<VariableListProps> = ({ items, command, ref }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      command({ id: item });
    },
    [command, items]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((idx) => (idx + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((idx) => (idx + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="flex flex-col min-w-[8rem] bg-popover rounded-md border p-1 shadow-md">
      {items.map((item, index) => (
        <button
          type="button"
          key={index}
          className={cn(
            'rounded-sm text-left px-2 py-1.5 text-sm',
            index === selectedIndex && 'bg-accent text-accent-foreground'
          )}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item}
        </button>
      ))}
    </div>
  );
};
