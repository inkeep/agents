'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import type { SelectOption } from '@/components/form/generic-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface CredentialMultiSelectProps<FV extends FieldValues> {
  control: Control<FV>;
  name: FieldPath<FV>;
  label: string;
  description?: string;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
}

export function CredentialMultiSelect<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  placeholder = 'Select credentials...',
  searchPlaceholder = 'Search credentials...',
}: CredentialMultiSelectProps<TFieldValues>) {
  const [open, setOpen] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected: string[] = field.value ?? [];

        const toggleValue = (value: string) => {
          const next = selected.includes(value)
            ? selected.filter((v) => v !== value)
            : [...selected, value];
          field.onChange(next);
        };

        const removeValue = (value: string) => {
          field.onChange(selected.filter((v) => v !== value));
        };

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Popover open={open} onOpenChange={setOpen}>
              <FormControl>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                  >
                    {selected.length > 0 ? (
                      <span className="text-muted-foreground">
                        {selected.length} credential{selected.length !== 1 ? 's' : ''} selected
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown aria-hidden className="opacity-50 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
              </FormControl>
              <PopoverContent className="p-0 w-(--radix-popover-trigger-width)">
                <Command>
                  <CommandInput placeholder={searchPlaceholder} className="h-9" />
                  <CommandList>
                    <CommandEmpty>No credentials found.</CommandEmpty>
                    <CommandGroup>
                      {options.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          onSelect={() => toggleValue(option.value)}
                        >
                          {option.label}
                          <Check
                            aria-hidden
                            className={cn(
                              'ml-auto',
                              selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selected.map((id) => {
                  const opt = options.find((o) => o.value === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {opt?.label ?? id}
                      <button
                        type="button"
                        className="rounded-full hover:bg-muted-foreground/20"
                        onClick={() => removeValue(id)}
                        aria-label={`Remove ${opt?.label ?? id}`}
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
