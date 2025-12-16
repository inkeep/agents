import type { SuggestionProps } from '@tiptap/suggestion';
import type { FC } from 'react';
import { useCallback, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type VariableListItem = string;

export type VariableListProps = SuggestionProps<VariableListItem, { id: VariableListItem }>;

export const VariableList: FC<VariableListProps> = ({ items, command }) => {
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
      <DropdownMenuContent
        align="start"
        sideOffset={-15}
        className="max-h-64"
        // Update dropdown position when user scroll on page or in editor
        updatePositionStrategy="always"
      >
        {items.map((item) => (
          <DropdownMenuItem key={item} data-label={item} onSelect={selectItem} aria-label="Suggest">
            {item}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
