import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState } from '../empty-state';

interface ComponentItem {
  id: string;
  name: string;
  description?: string;
}

interface ComponentDropdownProps<T extends ComponentItem> {
  selectedComponents: string[];
  handleToggle: (componentId: string) => void;
  availableComponents: T[];
  emptyStateMessage?: string;
  emptyStateActionText?: string;
  emptyStateActionHref?: string;
  placeholder?: string;
}

export function ComponentDropdown<T extends ComponentItem>({
  selectedComponents,
  handleToggle,
  availableComponents,
  emptyStateMessage,
  emptyStateActionText,
  emptyStateActionHref,
  placeholder = 'Select components...',
}: ComponentDropdownProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-transparent text-gray-700"
          >
            {selectedComponents.length === 0 ? (
              <div className="text-muted-foreground">{placeholder}</div>
            ) : (
              `${selectedComponents.length} selected`
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Search components..." />
            <CommandEmpty>
              <EmptyState
                message={emptyStateMessage || 'No components found.'}
                actionText={emptyStateActionText}
                actionHref={emptyStateActionHref}
              />
            </CommandEmpty>
            <CommandList className="max-h-64">
              <CommandGroup>
                {availableComponents.map(({ id, name, description }) => (
                  <CommandItem
                    key={id}
                    onSelect={() => handleToggle(id)}
                    className="flex items-start gap-3 p-3 group cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedComponents.includes(id)}
                      className="mt-0.5 [&_svg]:!text-primary-foreground"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{name}</span>
                      </div>
                      {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
