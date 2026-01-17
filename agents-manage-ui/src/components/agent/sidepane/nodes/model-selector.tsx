'use client';

import { Check, ChevronsUpDown, Info, X } from 'lucide-react';
import { useState } from 'react';
import { modelOptions } from '@/components/agent/configuration/model-options';
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
  onProviderOptionsChange?: (options: Record<string, any>) => void;
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
  onProviderOptionsChange,
  placeholder = 'Select a model...',
  inheritedValue,
  isRequired = false,
  canClear = true,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState<
    'openrouter' | 'gateway' | 'nim' | 'custom' | 'azure' | null
  >(null);
  const [azureDeploymentName, setAzureDeploymentName] = useState('');
  const [azureResourceName, setAzureResourceName] = useState('');
  const [azureBaseURL, setAzureBaseURL] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');

  const selectedModel = useMemo(() => {
    for (const [_provider, models] of Object.entries(modelOptions)) {
      const model = models.find((m) => m.value === value);
      if (model) return model;
    }
    // Handle custom models with prefix display
    if (value) {
      if (value.startsWith('openrouter/')) {
        const modelName = value.replace('openrouter/', '');
        return { value, label: modelName, prefix: 'openrouter/' };
      }
      if (value.startsWith('gateway/')) {
        const modelName = value.replace('gateway/', '');
        return { value, label: modelName, prefix: 'gateway/' };
      }
      if (value.startsWith('nim/')) {
        const modelName = value.replace('nim/', '');
        return { value, label: modelName, prefix: 'nim/' };
      }
      if (value.startsWith('custom/')) {
        const modelName = value.replace('custom/', '');
        return { value, label: modelName, prefix: 'custom/' };
      }
      if (value.startsWith('azure/')) {
        const modelName = value.replace('azure/', '');
        return { value, label: modelName, prefix: 'azure/' };
      }
      return { value, label: `${value} (custom)` };
    }
    return null;
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
      {label && (
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
      )}
      <div className="relative">
        <div className="flex w-full shadow-xs rounded-md">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  'justify-between bg-background dark:bg-input/30 flex-1 text-foreground shadow-none truncate',
                  selectedModel && canClear ? 'rounded-r-none border-r-0' : 'rounded-r-md'
                )}
              >
                {selectedModel ? (
                  <div className="truncate">
                    {'prefix' in selectedModel && selectedModel.prefix && (
                      <span className="text-gray-400">{selectedModel.prefix}</span>
                    )}
                    {selectedModel.label}
                  </div>
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
                <CommandInput placeholder="Search models or type custom model ID..." />
                <CommandList className="max-h-64">
                  <CommandEmpty>
                    {(() => {
                      // Only access document on the client side
                      if (typeof document !== 'undefined') {
                        const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
                        const searchValue = input?.value || '';

                        if (searchValue.trim()) {
                          return (
                            <CommandItem
                              className="flex items-center justify-between cursor-pointer text-foreground"
                              value={searchValue}
                              onSelect={() => {
                                const modelValue = searchValue.trim();

                                // Auto-add prefixes if they look like they belong to these services
                                if (
                                  modelValue.includes('/') &&
                                  !modelValue.startsWith('openrouter/') &&
                                  !modelValue.startsWith('gateway/') &&
                                  !modelValue.startsWith('nim/') &&
                                  !modelValue.startsWith('custom/')
                                ) {
                                  // Could be openrouter format, let user decide or add logic here
                                }

                                onValueChange?.(modelValue);
                                setOpen(false);
                              }}
                            >
                              Use "{searchValue}" as custom model
                            </CommandItem>
                          );
                        }
                      }

                      return (
                        <div className="p-2 text-muted-foreground text-sm">
                          Type to search models or enter a custom model ID
                        </div>
                      );
                    })()}
                  </CommandEmpty>
                  {/* Predefined models */}
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
                            setCustomModelInput('');
                            setShowCustomInput(null);
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
                  {/* Custom OpenAI-compatible */}
                  <CommandGroup heading="Custom OpenAI-compatible">
                    <CommandItem
                      className="flex items-center justify-between cursor-pointer text-foreground"
                      value="__custom__"
                      onSelect={() => {
                        setShowCustomInput('custom');
                        setOpen(false);
                        setCustomModelInput('');
                      }}
                    >
                      Custom OpenAI-compatible ...
                    </CommandItem>
                  </CommandGroup>
                  {/* LLM Gateway options */}
                  <CommandGroup heading="LLM Gateway">
                    <CommandItem
                      className="flex items-center justify-between cursor-pointer text-foreground"
                      value="__openrouter__"
                      onSelect={() => {
                        setShowCustomInput('openrouter');
                        setOpen(false);
                        setCustomModelInput('');
                      }}
                    >
                      OpenRouter ...
                    </CommandItem>
                    <CommandItem
                      className="flex items-center justify-between cursor-pointer text-foreground"
                      value="__gateway__"
                      onSelect={() => {
                        setShowCustomInput('gateway');
                        setOpen(false);
                        setCustomModelInput('');
                      }}
                    >
                      Vercel AI Gateway ...
                    </CommandItem>
                    <CommandItem
                      className="flex items-center justify-between cursor-pointer text-foreground"
                      value="__nim__"
                      onSelect={() => {
                        setShowCustomInput('nim');
                        setOpen(false);
                        setCustomModelInput('');
                      }}
                    >
                      NVIDIA NIM ...
                    </CommandItem>
                    <CommandItem
                      className="flex items-center justify-between cursor-pointer text-foreground"
                      value="__azure__"
                      onSelect={() => {
                        setShowCustomInput('azure');
                        setOpen(false);
                        setCustomModelInput('');
                        setAzureDeploymentName('');
                        setAzureResourceName('');
                        setAzureBaseURL('');
                      }}
                    >
                      Azure ...
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {showCustomInput && showCustomInput !== 'azure' && (
            <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-background border rounded-md shadow-lg z-20">
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {showCustomInput === 'openrouter'
                    ? 'OpenRouter Model ID'
                    : showCustomInput === 'gateway'
                      ? 'Vercel AI Gateway Model ID'
                      : showCustomInput === 'nim'
                        ? 'NVIDIA NIM Model ID'
                        : 'Custom Model ID'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {showCustomInput === 'openrouter'
                    ? 'Examples: anthropic/claude-3-5-sonnet, meta-llama/llama-3.1-405b-instruct'
                    : showCustomInput === 'gateway'
                      ? 'Examples: openai/gpt-4o, anthropic/claude-3-5-sonnet'
                      : showCustomInput === 'nim'
                        ? 'Examples: nvidia/llama-3.3-nemotron-super-49b-v1.5, nvidia/nemotron-4-340b-instruct'
                        : 'Examples: my-custom-model, llama-3-custom, custom-finetuned'}
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={
                      showCustomInput === 'openrouter'
                        ? 'anthropic/claude-3-5-sonnet'
                        : showCustomInput === 'gateway'
                          ? 'openai/gpt-4o'
                          : showCustomInput === 'nim'
                            ? 'nvidia/llama-3.3-nemotron-super-49b-v1.5'
                            : 'my-custom-model'
                    }
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customModelInput.trim()) {
                        const prefix =
                          showCustomInput === 'openrouter'
                            ? 'openrouter/'
                            : showCustomInput === 'gateway'
                              ? 'gateway/'
                              : showCustomInput === 'nim'
                                ? 'nim/'
                                : 'custom/';
                        onValueChange?.(`${prefix}${customModelInput.trim()}`);
                        setShowCustomInput(null);
                        setCustomModelInput('');
                        setOpen(false);
                      }
                      if (e.key === 'Escape') {
                        setShowCustomInput(null);
                        setCustomModelInput('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (customModelInput.trim()) {
                        const prefix =
                          showCustomInput === 'openrouter'
                            ? 'openrouter/'
                            : showCustomInput === 'gateway'
                              ? 'gateway/'
                              : showCustomInput === 'nim'
                                ? 'nim/'
                                : 'custom/';
                        onValueChange?.(`${prefix}${customModelInput.trim()}`);
                        setShowCustomInput(null);
                        setCustomModelInput('');
                        setOpen(false);
                      }
                    }}
                    disabled={!customModelInput.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCustomInput(null);
                      setCustomModelInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
          {showCustomInput === 'azure' && (
            <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-background border rounded-md shadow-lg z-20">
              <div className="space-y-3">
                <div className="text-sm font-medium">Azure Configuration</div>
                <div className="text-xs text-muted-foreground">
                  Configure your Azure deployment and connection details
                </div>

                <div>
                  <label htmlFor="azure-deployment-name" className="block text-xs font-medium mb-1">
                    Deployment Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="azure-deployment-name"
                    className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="my-gpt-4o-deployment"
                    value={azureDeploymentName}
                    onChange={(e) => setAzureDeploymentName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Your Azure model deployment name (required)
                  </p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Choose one connection method <span className="text-red-500">*</span>
                  </p>

                  <div>
                    <label htmlFor="azure-resource-name" className="block text-xs font-medium mb-1">
                      Azure Resource Name
                    </label>
                    <input
                      id="azure-resource-name"
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your-azure-resource"
                      value={azureResourceName}
                      onChange={(e) => setAzureResourceName(e.target.value)}
                    />
                  </div>

                  <div className="text-center text-xs text-muted-foreground my-2">— OR —</div>

                  <div>
                    <label htmlFor="azure-base-url" className="block text-xs font-medium mb-1">
                      Custom Base URL
                    </label>
                    <input
                      id="azure-base-url"
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://your-endpoint.com"
                      value={azureBaseURL}
                      onChange={(e) => setAzureBaseURL(e.target.value)}
                    />
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Set <code>AZURE_API_KEY</code> environment variable
                </div>

                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (
                        azureDeploymentName.trim() &&
                        (azureResourceName.trim() || azureBaseURL.trim())
                      ) {
                        // Set the Azure model FIRST so the store has it
                        onValueChange?.(`azure/${azureDeploymentName.trim()}`);

                        // Then set the provider options
                        const providerOptions: Record<string, any> = {};
                        if (azureResourceName.trim()) {
                          providerOptions.resourceName = azureResourceName.trim();
                        } else if (azureBaseURL.trim()) {
                          providerOptions.baseURL = azureBaseURL.trim();
                        }
                        onProviderOptionsChange?.(providerOptions);

                        setShowCustomInput(null);
                        setAzureDeploymentName('');
                        setAzureResourceName('');
                        setAzureBaseURL('');
                      }
                    }}
                    disabled={
                      !azureDeploymentName.trim() ||
                      (!azureResourceName.trim() && !azureBaseURL.trim())
                    }
                  >
                    Configure
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCustomInput(null);
                      setAzureDeploymentName('');
                      setAzureResourceName('');
                      setAzureBaseURL('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
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
                <X className="h-4 w-4 text-gray-500 dark:text-white/40" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
