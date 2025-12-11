import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SuggestionProps } from '@tiptap/suggestion';
import { type FC, useCallback, useState } from 'react';

export type VariableSuggestionItem = {
  label: string;
  detail: string;
};

interface VariableListProps extends SuggestionProps<VariableSuggestionItem> {}

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
      <DropdownMenuContent sideOffset={1} align="start">
        {items.length ? (
          items.map((item) => (
            <DropdownMenuItem key={item.label} data-label={item.label} onSelect={selectItem}>
              <span className="truncate">{item.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{item.detail}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">No suggestions</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
