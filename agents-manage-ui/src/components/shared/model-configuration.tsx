'use client';

import { GATEWAY_ROUTABLE_PROVIDERS_SET } from '@inkeep/agents-core/client-exports';
import { GripVertical, Plus, X } from 'lucide-react';
import { type FC, type ReactNode, useId, useState } from 'react';
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCapabilitiesQuery } from '@/lib/query/capabilities';
import {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  providerOptionsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { cn } from '@/lib/utils';
import { FieldLabel } from '../agent/sidepane/form-components/label';
import { AzureConfigurationSection } from './azure-configuration-section';

const AVAILABLE_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'azure', label: 'Azure' },
  { value: 'vertex', label: 'Google Vertex' },
] as const;

const providerLabel = (value: string) =>
  AVAILABLE_PROVIDERS.find((p) => p.value === value)?.label ?? value;

type ModelConfigurationSlot = 'base' | 'structuredOutput' | 'summarizer';

interface ModelConfigurationInheritedValues {
  model?: string;
  providerOptions?: string | Record<string, unknown>;
  fallbackModels?: string[] | null;
  allowedProviders?: string[] | null;
}

const MODEL_CONFIGURATION_LABELS: Record<ModelConfigurationSlot, string> = {
  base: 'Base model',
  structuredOutput: 'Structured output model',
  summarizer: 'Summarizer model',
};

const MODEL_CONFIGURATION_DESCRIPTIONS: Record<ModelConfigurationSlot, string> = {
  base: 'Primary model for general agent responses',
  structuredOutput: 'Model for structured outputs and components (defaults to base model)',
  summarizer: 'Model for summarization tasks (defaults to base model)',
};

const MODEL_CONFIGURATION_PLACEHOLDERS: Record<ModelConfigurationSlot, string> = {
  base: 'Select base model',
  structuredOutput: 'Select structured output model (optional)',
  summarizer: 'Select summarizer model (optional)',
};

function getModelConfigurationSlot(name: string): ModelConfigurationSlot {
  const slot = name.split('.').at(-1);
  if (slot && ['base', 'structuredOutput', 'summarizer'].includes(slot)) {
    return slot as ModelConfigurationSlot;
  }

  throw new Error(`Unsupported model configuration path: ${name}`);
}

function getJsonPlaceholder({ model, slot }: { model?: string; slot: ModelConfigurationSlot }) {
  if (model?.startsWith('azure/')) {
    return slot === 'summarizer'
      ? azureModelSummarizerProviderOptionsTemplate
      : azureModelProviderOptionsTemplate;
  }

  if (slot === 'structuredOutput') {
    return structuredOutputModelProviderOptionsTemplate;
  }

  if (slot === 'summarizer') {
    return summarizerModelProviderOptionsTemplate;
  }

  return providerOptionsTemplate;
}

const AllowedProvidersSection: FC<{
  inheritedAllowedProviders?: string[];
  disabled: boolean;
  name: string;
  control: Control<any>;
}> = ({ inheritedAllowedProviders, disabled, name, control }) => {
  const [addOpen, setAddOpen] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');
  const [specificMode, setSpecificMode] = useState(false);
  const { field: allowedProvidersField } = useController({
    control,
    name: `${name}.allowedProviders`,
    shouldUnregister: true,
  });
  const allowedProviders: string[] = allowedProvidersField.value;
  function onAllowedProvidersChange(providers: string[]) {
    allowedProvidersField.onChange(providers.length ? providers : undefined);
  }
  const effectiveProviders = allowedProviders ?? inheritedAllowedProviders ?? [];
  const isInherited = !allowedProviders && !!inheritedAllowedProviders;
  const isSpecific = specificMode || effectiveProviders.length > 0;

  const effectiveSet = new Set(effectiveProviders);
  const availableToAdd = AVAILABLE_PROVIDERS.filter((p) => !effectiveSet.has(p.value));

  function handleReorder(fromId: string, toId: string) {
    if (fromId === toId || !allowedProviders) return;
    const list = [...allowedProviders];
    const fromIndex = list.indexOf(fromId);
    const toIndex = list.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    onAllowedProvidersChange(list);
  }

  const allProvidersId = useId();
  const specificProvidersId = useId();

  return (
    <div className="space-y-3">
      <FieldLabel
        label="Allowed providers"
        tooltip="Restrict and prioritize which providers can serve requests. Order determines preference."
      />
      <RadioGroup
        value={isSpecific ? 'specific' : 'all'}
        onValueChange={(val) => {
          if (val === 'all') {
            setSpecificMode(false);
            onAllowedProvidersChange([]);
          } else {
            setSpecificMode(true);
          }
        }}
        disabled={disabled || isInherited}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="all" id={allProvidersId} />
          <Label htmlFor={allProvidersId} className="text-sm font-normal cursor-pointer">
            All providers
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="specific" id={specificProvidersId} />
          <Label htmlFor={specificProvidersId} className="text-sm font-normal cursor-pointer">
            Specific providers
          </Label>
        </div>
      </RadioGroup>

      {isSpecific && (
        <div className="space-y-2">
          <div className="border rounded-md text-xs">
            <ul>
              {effectiveProviders.map((provider, index) => (
                <li
                  key={provider}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 transition-colors',
                    index > 0 && 'border-t',
                    dragOverId === provider ? 'bg-muted/30' : 'hover:bg-muted/30'
                  )}
                  draggable={!disabled && !isInherited}
                  data-id={provider}
                  onDragStart={(e) => setDraggingId(e.currentTarget.dataset.id as string)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverId(e.currentTarget.dataset.id as string);
                  }}
                  onDragLeave={() => setDragOverId('')}
                  onDrop={(e) => {
                    handleReorder(draggingId, e.currentTarget.dataset.id as string);
                    setDraggingId('');
                    setDragOverId('');
                  }}
                  onDragEnd={() => {
                    setDraggingId('');
                    setDragOverId('');
                  }}
                >
                  <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}.</span>
                  <span className="text-sm grow">{providerLabel(provider)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      const next = (allowedProviders ?? []).filter((p) => p !== provider);
                      onAllowedProvidersChange(next);
                    }}
                    disabled={disabled || isInherited}
                    aria-label={`Remove ${providerLabel(provider)}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {availableToAdd.length > 0 && (
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={disabled || isInherited}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add provider
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-(--radix-popover-trigger-width)" align="start">
                <Command>
                  <CommandList>
                    <CommandEmpty>No providers available</CommandEmpty>
                    {availableToAdd.map((provider) => (
                      <CommandItem
                        key={provider.value}
                        value={provider.value}
                        className="cursor-pointer"
                        onSelect={() => {
                          onAllowedProvidersChange([...(allowedProviders ?? []), provider.value]);
                          setAddOpen(false);
                        }}
                      >
                        {provider.label}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
};

const FallbackModelsSection: FC<{
  inheritedFallbackModels?: string[];
  disabled: boolean;
  name: string;
  control: Control<any>;
}> = ({ inheritedFallbackModels, disabled, name, control }) => {
  const [showPendingSelector, setShowPendingSelector] = useState(false);
  const { field: fallbackModelsField } = useController({
    control,
    name: `${name}.fallbackModels`,
    shouldUnregister: true,
  });
  const fallbackModels = fallbackModelsField.value;
  function onFallbackModelsChange(models: string[]) {
    fallbackModelsField.onChange(models.length ? models : undefined);
  }
  const savedModels: string[] = fallbackModels ?? inheritedFallbackModels ?? [];
  const isInherited = !fallbackModels && !!inheritedFallbackModels;

  return (
    <div className="space-y-2">
      <FieldLabel
        label="Fallback models"
        tooltip="Ordered list of models to try if the primary model fails. Requires AI Gateway."
      />
      {savedModels.map((model, index) => (
        <div key={`${model}-${index}`} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}.</span>
          <div className="flex-1">
            <ModelSelector
              value={model}
              gatewayOnly
              onValueChange={(newValue) => {
                const models = [...(fallbackModels ?? [])];
                if (newValue) {
                  models[index] = newValue;
                } else {
                  models.splice(index, 1);
                }
                onFallbackModelsChange(models);
              }}
              placeholder="Select fallback model..."
              canClear={false}
              disabled={disabled || isInherited}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              const models = [...(fallbackModels ?? [])];
              models.splice(index, 1);
              onFallbackModelsChange(models);
            }}
            disabled={disabled || isInherited}
            aria-label="Remove fallback model"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {showPendingSelector ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4 shrink-0">
            {savedModels.length + 1}.
          </span>
          <div className="flex-1">
            <ModelSelector
              value=""
              gatewayOnly
              defaultOpen
              onValueChange={(newValue) => {
                setShowPendingSelector(false);
                if (newValue) {
                  onFallbackModelsChange([...(fallbackModels ?? []), newValue]);
                }
              }}
              onClose={() => setShowPendingSelector(false)}
              placeholder="Select fallback model..."
              canClear={false}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setShowPendingSelector(false)}
            aria-label="Cancel adding fallback model"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowPendingSelector(true)}
          disabled={disabled || isInherited}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add fallback model
        </Button>
      )}
    </div>
  );
};

interface ModelConfigurationProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues | undefined = undefined,
> {
  /** Label for the model selector */
  label?: React.ReactNode;
  /** Description text shown below the selector */
  description?: string;
  /**
   * Whether the clear button should be shown
   * @default true
   */
  canClear?: boolean;
  inherited?: ModelConfigurationInheritedValues;
  /** Whether this field is required */
  isRequired?: boolean;
  /** Whether the component is disabled/read-only */
  disabled?: boolean;
  control: Control<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
}

export function ModelConfiguration<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  label,
  description,
  canClear = true,
  isRequired,
  inherited,
  disabled = false,
  control,
  name,
}: ModelConfigurationProps<TFieldValues, TTransformedValues>) {
  const { data: capabilities } = useCapabilitiesQuery();
  const slot = getModelConfigurationSlot(name);

  const { field: modelField } = useController({
    control,
    name: `${name}.model` as FieldPath<TFieldValues>,
    shouldUnregister: true,
  });
  const value = modelField.value;
  const onModelChange = modelField.onChange;

  const { field: providerOptionsField } = useController({
    control,
    name: `${name}.providerOptions` as FieldPath<TFieldValues>,
  });
  const providerOptions = providerOptionsField.value;
  const onProviderOptionsChange = providerOptionsField.onChange;

  const inheritedValue = inherited?.model;
  const inheritedProviderOptions = inherited?.providerOptions ?? '';

  function handleModelChange(modelValue: string) {
    const previousEffectiveModel = value || inheritedValue;
    const newModel = modelValue || undefined;
    const wasInherited = !value && !!inheritedValue;
    const isNowExplicit = !!newModel;

    // Clear provider options when:
    // 1. Model value changes, OR
    // 2. Switching from inherited to explicit (even if same model)
    if (previousEffectiveModel !== newModel || (wasInherited && isNowExplicit)) {
      onProviderOptionsChange('');
    }

    onModelChange(newModel || '');
  }

  function handleProviderOptionsChange(options: Record<string, any>) {
    if (!Object.keys(options).length) {
      onProviderOptionsChange('');
      return;
    }
    const jsonString = JSON.stringify(options, null, 2);
    onProviderOptionsChange(jsonString);
  }

  const effectiveModel = value || inheritedValue;
  const effectiveProviderOptions = value ? providerOptions : inheritedProviderOptions;
  const isUsingInheritedOptions = !value && !!inheritedValue;

  const modelProvider = effectiveModel?.split('/')[0] ?? '';
  const isGatewayRoutable =
    GATEWAY_ROUTABLE_PROVIDERS_SET.has(modelProvider) || modelProvider === 'gateway';

  const jsonPlaceholder = getJsonPlaceholder({ model: effectiveModel, slot });
  const providerOptionsId = useId();
  return (
    <div className="space-y-4">
      <MyForm control={control} name={`${name}.model` as FieldPath<TFieldValues>}>
        <FormLabel isRequired={isRequired}>{label ?? MODEL_CONFIGURATION_LABELS[slot]}</FormLabel>
        <FormControl>
          <ModelSelector
            value={value || ''}
            onValueChange={handleModelChange}
            onProviderOptionsChange={handleProviderOptionsChange}
            inheritedValue={inheritedValue}
            placeholder={MODEL_CONFIGURATION_PLACEHOLDERS[slot]}
            canClear={canClear}
            disabled={disabled}
          />
        </FormControl>
        <FormDescription>{description ?? MODEL_CONFIGURATION_DESCRIPTIONS[slot]}</FormDescription>
      </MyForm>

      {effectiveModel && (
        <>
          {effectiveModel.startsWith('azure/') && (
            /* Azure Configuration Fields */
            <AzureConfigurationSection
              providerOptions={effectiveProviderOptions}
              onProviderOptionsChange={onProviderOptionsChange}
              disabled={disabled || isUsingInheritedOptions}
            />
          )}
          <MyForm control={control} name={`${name}.providerOptions` as FieldPath<TFieldValues>}>
            <FormLabel>
              Provider options
              {isUsingInheritedOptions && (
                <i className="text-xs text-muted-foreground"> (inherited)</i>
              )}
            </FormLabel>
            <FormControl>
              <StandaloneJsonEditor
                name={providerOptionsId}
                onChange={onProviderOptionsChange}
                value={
                  typeof effectiveProviderOptions === 'object'
                    ? JSON.stringify(effectiveProviderOptions, null, 2)
                    : effectiveProviderOptions
                }
                placeholder={jsonPlaceholder}
                customTemplate={jsonPlaceholder}
                readOnly={disabled || isUsingInheritedOptions}
              />
            </FormControl>
          </MyForm>
          {capabilities?.modelFallback?.enabled && isGatewayRoutable && (
            <>
              <AllowedProvidersSection
                inheritedAllowedProviders={inherited?.allowedProviders ?? undefined}
                disabled={disabled}
                name={name}
                control={control}
              />
              <FallbackModelsSection
                inheritedFallbackModels={inherited?.fallbackModels ?? undefined}
                disabled={disabled}
                name={name}
                control={control}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

interface MyFormProps<TFieldValues extends FieldValues, TTransformedValues extends FieldValues> {
  control: Control<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  children: ReactNode;
}

function MyForm<TFieldValues extends FieldValues, TTransformedValues extends FieldValues>({
  control,
  name,
  children,
}: MyFormProps<TFieldValues, TTransformedValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          {children}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
