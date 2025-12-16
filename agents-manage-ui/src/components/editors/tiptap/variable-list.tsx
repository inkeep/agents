import type { SuggestionProps } from '@tiptap/suggestion';
import { type FC, type RefObject, useImperativeHandle } from 'react';
import { useCallback, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type VariableListItem = string;

export type VariableListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export interface VariableListProps
  extends SuggestionProps<VariableListItem, { id: VariableListItem }> {
  ref: RefObject<VariableListRef>;
}

/**
 * Based on Tiptap mention example
 * @see https://github.com/ueberdosis/tiptap/blob/main/demos/src/Nodes/Mention/React/MentionList.jsx
 */
export const VariableList: FC<VariableListProps> = ({ items, command, ref }) => {
  const [open, setOpen] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = useCallback(
    (event: any) => {
      const id = (event.currentTarget as HTMLElement).dataset.label as string;
      command({ id });
    },
    [command]
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
        command({ id: items[selectedIndex] });
        return true;
      }

      return false;
    },
  }));

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      // Setting modal false, so hovering on sidebar will still expand it
      modal={false}
    >
      <DropdownMenuTrigger />
      <DropdownMenuContent
        align="start"
        sideOffset={-15}
        className="max-h-64"
        // Update dropdown position when user scroll on page or in editor
        updatePositionStrategy="always"
        // @ts-expect-error
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {items.length ? (
          items.map((item, index) => (
            <DropdownMenuItem
              key={item}
              data-label={item}
              onSelect={selectItem}
              aria-label="Suggest"
              className={selectedIndex === index ? 'bg-accent text-accent-foreground' : ''}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No result</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
