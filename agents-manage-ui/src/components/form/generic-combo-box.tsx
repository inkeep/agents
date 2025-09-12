'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FormFieldWrapper } from './form-field-wrapper';
import type { SelectOption } from './generic-select';

interface GenericComboBoxProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: SelectOption[];
  searchPlaceholder?: string;
  placeholder?: string;
  disabled?: boolean;
  isRequired?: boolean;
}

export function GenericComboBox<T extends FieldValues>({
  control,
  name,
  label,
  options,
  searchPlaceholder = 'Search...',
  placeholder,
  disabled = false,
  isRequired = false,
}: GenericComboBoxProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <FormFieldWrapper control={control} name={name} label={label} isRequired={isRequired}>
      {(field) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between text-gray-700 "
              disabled={disabled}
            >
              {field.value ? (
                options.find((option) => option.value === field.value)?.label
              ) : (
                <div className="text-muted-foreground">{placeholder}</div>
              )}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] ">
            <Command>
              <CommandInput placeholder={searchPlaceholder} className="h-9" />
              <CommandList>
                <CommandEmpty>No options found.</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      onSelect={(currentValue) => {
                        field.onChange(currentValue === field.value ? '' : currentValue);
                        setOpen(false);
                      }}
                    >
                      {option.label}
                      <Check
                        className={cn(
                          'ml-auto',
                          field.value === option.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  );
}
