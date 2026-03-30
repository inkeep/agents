'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { modelOptions } from '@/components/agent/configuration/model-options';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
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
  disabled?: boolean;
}

export const ModelSelector: FC<ModelSelectorProps> = ({
  label = 'Model',
  tooltip,
  value,
  onValueChange,
  onProviderOptionsChange,
  placeholder = 'Select a model...',
  inheritedValue,
  isRequired = false,
  canClear = true,
  disabled = false,
}) => {
  'use memo';

  const [open, setOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState<
    'openrouter' | 'gateway' | 'nim' | 'custom' | 'azure' | null
  >(null);
  const [azureDeploymentName, setAzureDeploymentName] = useState('');
  const [azureResourceName, setAzureResourceName] = useState('');
  const [azureBaseURL, setAzureBaseURL] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const { setHasOpenModelConfig } = useAgentActions();

  useEffect(() => {
    setHasOpenModelConfig(showCustomInput !== null);
  }, [showCustomInput]);

  const selectedModel = (() => {
    for (const models of Object.values(modelOptions)) {
      const model = models.find((m) => m.value === value);
      if (model) return model;
    }
    if (!value) {
      return null;
    }
    // Handle custom models with prefix display
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
  })();

  const inheritedModel = (() => {
    if (!inheritedValue) return null;
    for (const models of Object.values(modelOptions)) {
      const model = models.find((m) => m.value === inheritedValue);
      if (model) return model;
    }
    return { value: inheritedValue, label: inheritedValue };
  })();

  return (
    <div className="flex flex-col gap-2">
      {label && <FieldLabel label={label} tooltip={tooltip} isRequired={isRequired} />}
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <ButtonGroup className="w-full">
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="justify-between flex-1"
            >
              {selectedModel ? (
                <div className="truncate">
                  {selectedModel.prefix && (
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
          {selectedModel && canClear && !disabled && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                onValueChange?.('');
              }}
              aria-label="Clear model selection"
              type="button"
            >
              <X />
            </Button>
          )}
        </ButtonGroup>
        <PopoverContent
          className="p-0 w-(--radix-popover-trigger-width) transition-all duration-200 ease-in-out"
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
                    const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
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
                    onValueChange?.('openrouter/...');
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
                    onValueChange?.('gateway/...');
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
                    onValueChange?.('nim/...');
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
                    onValueChange?.('azure/...');
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
        <Card className="p-3 gap-3">
          <div className="text-sm font-medium">
            {{
              openrouter: 'OpenRouter Model ID',
              gateway: 'Vercel AI Gateway Model ID',
              nim: 'NVIDIA NIM Model ID',
              custom: '',
            }[showCustomInput] || 'Custom Model ID'}
          </div>
          <div className="text-xs text-muted-foreground">
            {{
              openrouter:
                'Examples: anthropic/claude-3-5-sonnet, meta-llama/llama-3.1-405b-instruct',
              gateway: 'Examples: openai/gpt-4o, anthropic/claude-3-5-sonnet',
              nim: 'Examples: nvidia/llama-3.3-nemotron-super-49b-v1.5, nvidia/nemotron-4-340b-instruct',
              custom: '',
            }[showCustomInput] || 'Examples: my-custom-model, llama-3-custom, custom-finetuned'}
          </div>
          <div className="flex gap-2 items-center">
            <Input
              placeholder={
                {
                  openrouter: 'anthropic/claude-3-5-sonnet',
                  gateway: 'openai/gpt-4o',
                  nim: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
                  custom: '',
                }[showCustomInput] || 'my-custom-model'
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
                onValueChange?.('');
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {showCustomInput === 'azure' && (
        <Card className="p-3 gap-3">
          <div className="text-sm font-medium">Azure Configuration</div>
          <div className="text-xs text-muted-foreground">
            Configure your Azure deployment and connection details
          </div>

          <div className="space-y-1">
            <FieldLabel
              id="azure-deployment-name"
              className="text-xs"
              label="Deployment Name"
              isRequired
            />
            <Input
              id="azure-deployment-name"
              placeholder="my-gpt-4o-deployment"
              value={azureDeploymentName}
              onChange={(e) => setAzureDeploymentName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Your Azure model deployment name</p>

            <Separator className="my-4" />

            <FieldLabel
              className="text-xs text-muted-foreground"
              label="Choose one connection method"
              isRequired
            />
            <FieldLabel id="azure-resource-name" className="text-xs" label="Azure Resource Name" />
            <Input
              id="azure-resource-name"
              placeholder="your-azure-resource"
              value={azureResourceName}
              onChange={(e) => setAzureResourceName(e.target.value)}
            />
            <div className="text-center text-xs text-muted-foreground">— OR —</div>
            <FieldLabel id="azure-base-url" className="text-xs" label="Custom Base URL" />
            <Input
              id="azure-base-url"
              placeholder="https://your-endpoint.com"
              value={azureBaseURL}
              onChange={(e) => setAzureBaseURL(e.target.value)}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Set <Badge variant="code">AZURE_API_KEY</Badge> environment variable
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
                !azureDeploymentName.trim() || (!azureResourceName.trim() && !azureBaseURL.trim())
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
                onValueChange?.('');
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
