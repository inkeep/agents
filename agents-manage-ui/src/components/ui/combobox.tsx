'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useDisclosure } from '@/hooks/use-disclosure';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type OptionType = {
  value: string;
  label: ReactNode;
  showCheckbox?: boolean;
  searchBy?: string | null;
};

interface ComboboxProps {
  options: OptionType[];
  onSelect: (value: any) => void;
  defaultValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  notFoundMessage?: string;
  shouldCloseOnSelect?: boolean;
  TriggerComponent?: ReactNode;
  onOpenChange?: () => void;
  multipleCheckboxValues?: string[];
  enableSearch?: boolean;
  className?: string;
}

export function Combobox({
  options,
  onSelect,
  defaultValue,
  searchPlaceholder = 'Search...',
  placeholder = '...',
  notFoundMessage = 'Not found',
  shouldCloseOnSelect = true,
  TriggerComponent,
  onOpenChange,
  multipleCheckboxValues,
  enableSearch = true,
  className,
}: ComboboxProps) {
  const { isOpen, onClose, onToggle } = useDisclosure();
  const [value, setValue] = useState(defaultValue);
  const commandRef = useRef<HTMLDivElement>(null);
  const currentLabel = useMemo(
    () => options.find((option) => option.value === value)?.label,
    [value, options]
  );

  const handleChangeOnOpen = () => {
    onOpenChange?.();
    onToggle();
  };

  useEffect(() => {
    if (!multipleCheckboxValues?.length) {
      setValue(defaultValue);
    }
  }, [multipleCheckboxValues?.length, defaultValue]);

  return (
    <Popover onOpenChange={handleChangeOnOpen} open={isOpen}>
      {TriggerComponent ?? (
        <PopoverTrigger asChild>
          <Button
            aria-expanded={isOpen}
            aria-label="Combobox"
            className="w-[250px] justify-between flex-nowrap"
            role="combobox"
            variant="outline"
          >
            <span className="overflow-hidden overflow-ellipsis">{currentLabel || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent align="start" className={cn('w-[250px] p-0', className)}>
        <Command ref={commandRef}>
          {enableSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList className="scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent">
            <CommandEmpty>{notFoundMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  className={cn(
                    'cursor-pointer',
                    option.showCheckbox
                      ? '[&[data-selected=true]>button]:opacity-100'
                      : 'flex items-center justify-between'
                  )}
                  key={option.value}
                  onSelect={(currentValue) => {
                    const newValue = option.searchBy ? option.value : currentValue;

                    onSelect(newValue);
                    setValue(newValue);
                    shouldCloseOnSelect && onClose();
                  }}
                  value={option.searchBy ?? option.value}
                >
                  {option.showCheckbox && (
                    <Checkbox
                      checked={multipleCheckboxValues?.includes(option.value)}
                      className={cn(
                        'w-4 h-4 mr-2 rounded-sm border border-gray-400 opacity-0',
                        multipleCheckboxValues?.includes(option.value) && 'opacity-100'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(option.value);
                        setValue(option.value);
                      }}
                    />
                  )}
                  {option.label}
                  {!option.showCheckbox && (
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4 text-gray-400 dark:text-white/40',
                        value === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
