'use client';

import { Check, ChevronsUpDown, Info, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { modelOptions } from '@/components/graph/configuration/model-options';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ModelSelectorProps {
  tooltip?: string;
  label?: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  inheritedValue?: string;
  isRequired?: boolean;
  canClear?: boolean;
}

export function ModelSelector({
  label = 'Model',
  tooltip,
  value,
  onValueChange,
  placeholder = 'Select a model...',
  inheritedValue,
  isRequired = false,
  canClear = true,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = useMemo(() => {
    for (const [_provider, models] of Object.entries(modelOptions)) {
      const model = models.find((m) => m.value === value);
      if (model) return model;
    }
    return value ? { value, label: value } : null;
  }, [value]);

  const inheritedModel = useMemo(() => {
    if (!inheritedValue) return null;
    for (const [_provider, models] of Object.entries(modelOptions)) {
      const model = models.find((m) => m.value === inheritedValue);
      if (model) return model;
    }
    return inheritedValue ? { value: inheritedValue, label: inheritedValue } : null;
  }, [inheritedValue]);

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isRequired && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex w-full shadow-xs rounded-md">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                'justify-between bg-background dark:bg-background flex-1 text-foreground shadow-none truncate',
                selectedModel && canClear ? 'rounded-r-none border-r-0' : 'rounded-r-md'
              )}
            >
              {selectedModel ? (
                <div className="truncate">{selectedModel.label}</div>
              ) : inheritedModel ? (
                <div className="truncate text-muted-foreground">
                  <span className="italic">{inheritedModel.label}</span>
                  <span className="text-xs ml-1">(inherited)</span>
                </div>
              ) : (
                <div className="text-muted-foreground">{placeholder}</div>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 w-[var(--radix-popover-trigger-width)] transition-all duration-200 ease-in-out"
            align="start"
            side="bottom"
            onWheel={(e) => {
              e.stopPropagation(); // to make scroll work inside dialog https://github.com/radix-ui/primitives/issues/1159
            }}
            onTouchMove={(e) => {
              e.stopPropagation(); // to make scroll work inside dialog https://github.com/radix-ui/primitives/issues/1159
            }}
          >
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandList className="max-h-64">
                <CommandEmpty>
                  <div className="text-muted-foreground">No model found.</div>
                </CommandEmpty>
                {Object.entries(modelOptions).map(([provider, models]) => (
                  <CommandGroup key={provider} heading={provider}>
                    {models.map((model) => (
                      <CommandItem
                        key={model.value}
                        className="flex items-center justify-between cursor-pointer text-foreground"
                        value={model.value}
                        onSelect={(currentValue) => {
                          onValueChange?.(currentValue === value ? '' : currentValue);
                          setOpen(false);
                        }}
                      >
                        {model.label}
                        <Check
                          className={cn(
                            'ml-2 h-4 w-4',
                            value === model.value ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {canClear && (
          <div
            className={cn(
              'transition-all duration-200 ease-in-out overflow-hidden',
              selectedModel && canClear ? 'w-10 opacity-100 scale-100' : 'w-0 opacity-0 scale-95'
            )}
          >
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-none border-l-0 px-2 bg-transparent w-10 transition-all duration-200 ease-in-out text-muted-foreground hover:text-foreground"
              onClick={() => {
                onValueChange?.('');
              }}
              aria-label="Clear model selection"
              type="button"
              disabled={!selectedModel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
