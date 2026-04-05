'use client';

import { GATEWAY_ROUTABLE_PROVIDERS_SET } from '@inkeep/agents-core/client-exports';
import { GripVertical, Plus, X } from 'lucide-react';
import { type FC, useState } from 'react';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useDerivedProp } from '@/hooks/use-derived-prop';
import { useCapabilitiesQuery } from '@/lib/query/capabilities';
import { azureModelProviderOptionsTemplate, providerOptionsTemplate } from '@/lib/templates';
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

const AllowedProvidersSection: FC<{
  allowedProviders?: string[];
  inheritedAllowedProviders?: string[];
  onAllowedProvidersChange: (providers: string[]) => void;
  disabled: boolean;
}> = ({ allowedProviders, inheritedAllowedProviders, onAllowedProvidersChange, disabled }) => {
  const [addOpen, setAddOpen] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');
  const [specificMode, setSpecificMode] = useState(false);

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
          <RadioGroupItem value="all" id="providers-all" />
          <Label htmlFor="providers-all" className="text-sm font-normal cursor-pointer">
            All providers
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="specific" id="providers-specific" />
          <Label htmlFor="providers-specific" className="text-sm font-normal cursor-pointer">
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
  editorNamePrefix: string;
  fallbackModels?: string[];
  inheritedFallbackModels?: string[];
  onFallbackModelsChange: (models: string[]) => void;
  disabled: boolean;
}> = ({
  editorNamePrefix,
  fallbackModels,
  inheritedFallbackModels,
  onFallbackModelsChange,
  disabled,
}) => {
  const [showPendingSelector, setShowPendingSelector] = useState(false);
  const savedModels = fallbackModels ?? inheritedFallbackModels ?? [];
  const isInherited = !fallbackModels && !!inheritedFallbackModels;

  return (
    <div className="space-y-2">
      <FieldLabel
        id={`${editorNamePrefix}-fallback-models`}
        label="Fallback models"
        tooltip="Ordered list of models to try if the primary model fails. Requires AI Gateway."
      />
      {savedModels.map((model, index) => (
        <div
          key={`${editorNamePrefix}-fallback-${model}-${index}`}
          className="flex items-center gap-2"
        >
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
      {showPendingSelector && (
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
      )}
      {!showPendingSelector && (
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

interface ModelConfigurationProps {
  /** Current model value */
  value?: string;
  /** Provider options value (JSON string or object) */
  providerOptions?: string | Record<string, unknown>;
  /** Inherited/default model value to show when no value is set */
  inheritedValue?: string;
  /** Inherited provider options to show when no value is set */
  inheritedProviderOptions?: string | Record<string, unknown>;
  /** Label for the model selector */
  label?: React.ReactNode;
  /** Description text shown below the selector */
  description?: string;
  /** Placeholder text for the model selector */
  placeholder?: string;
  /** Whether the clear button should be shown */
  canClear?: boolean;
  /** Whether this field is required */
  isRequired?: boolean;
  /** Called when the model value changes */
  onModelChange?: (value: string) => void;
  /** Called when provider options change */
  onProviderOptionsChange?: (value: string) => void;
  /** Unique name prefix for the JSON editor */
  editorNamePrefix?: string;
  /** Custom placeholder for the JSON editor based on model type */
  getJsonPlaceholder?: (model?: string) => string;
  /** Whether the component is disabled/read-only */
  disabled?: boolean;
  /** Ordered list of fallback models */
  fallbackModels?: string[];
  /** Inherited fallback models to show when no value is set */
  inheritedFallbackModels?: string[];
  /** Called when fallback models change */
  onFallbackModelsChange?: (models: string[]) => void;
  /** Ordered list of allowed providers */
  allowedProviders?: string[];
  /** Inherited allowed providers to show when no value is set */
  inheritedAllowedProviders?: string[];
  /** Called when allowed providers change */
  onAllowedProvidersChange?: (providers: string[]) => void;
}

export function ModelConfiguration({
  value,
  providerOptions,
  inheritedValue,
  inheritedProviderOptions,
  label,
  description,
  placeholder = 'Select a model...',
  canClear = true,
  isRequired = false,
  onModelChange,
  onProviderOptionsChange,
  editorNamePrefix = 'model',
  getJsonPlaceholder,
  disabled = false,
  fallbackModels,
  inheritedFallbackModels,
  onFallbackModelsChange,
  allowedProviders,
  inheritedAllowedProviders,
  onAllowedProvidersChange,
}: ModelConfigurationProps) {
  const { data: capabilities } = useCapabilitiesQuery();
  const [internalProviderOptions, setInternalProviderOptions] = useDerivedProp(providerOptions, {
    resetSource: value,
  });

  const handleModelChange = (modelValue: string) => {
    const previousEffectiveModel = value || inheritedValue;
    const newModel = modelValue || undefined;
    const wasInherited = !value && !!inheritedValue;
    const isNowExplicit = !!newModel;

    // Clear provider options when:
    // 1. Model value changes, OR
    // 2. Switching from inherited to explicit (even if same model)
    if (previousEffectiveModel !== newModel || (wasInherited && isNowExplicit)) {
      setInternalProviderOptions(undefined);
      onProviderOptionsChange?.('');
    }

    onModelChange?.(newModel || '');
  };

  const handleProviderOptionsChange = (options: Record<string, any>) => {
    if (!options || Object.keys(options).length === 0) {
      setInternalProviderOptions(undefined);
      onProviderOptionsChange?.('');
      return;
    }
    const jsonString = JSON.stringify(options, null, 2);
    setInternalProviderOptions(jsonString);
    onProviderOptionsChange?.(jsonString);
  };

  // Handle both string (from JSON editors) and object (from ModelSelector) inputs
  function handleProviderOptionsStringChange(nextValue = '') {
    setInternalProviderOptions(nextValue);
    onProviderOptionsChange?.(nextValue);
  }

  const getDefaultJsonPlaceholder = (model?: string) => {
    if (model?.startsWith('azure/')) {
      return azureModelProviderOptionsTemplate;
    }
    return providerOptionsTemplate;
  };

  const effectiveModel = value || inheritedValue;
  const effectiveProviderOptions = value ? internalProviderOptions : inheritedProviderOptions;
  const isUsingInheritedOptions = !value && !!inheritedValue;

  const modelProvider = effectiveModel?.split('/')[0] ?? '';
  const isGatewayRoutable =
    GATEWAY_ROUTABLE_PROVIDERS_SET.has(modelProvider) || modelProvider === 'gateway';

  const jsonPlaceholder = getJsonPlaceholder
    ? getJsonPlaceholder(effectiveModel)
    : getDefaultJsonPlaceholder(effectiveModel);

  return (
    <div className="space-y-4">
      <div className="relative space-y-2">
        <ModelSelector
          value={value || ''}
          onValueChange={handleModelChange}
          onProviderOptionsChange={handleProviderOptionsChange}
          inheritedValue={inheritedValue}
          label={label}
          placeholder={placeholder}
          canClear={canClear}
          isRequired={isRequired}
          disabled={disabled}
        />
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {/* Azure Configuration Fields */}
      {effectiveModel?.startsWith('azure/') && (
        <AzureConfigurationSection
          providerOptions={effectiveProviderOptions}
          onProviderOptionsChange={handleProviderOptionsStringChange}
          editorNamePrefix={editorNamePrefix}
          disabled={disabled || isUsingInheritedOptions}
        />
      )}

      {/* Provider Options JSON Editor */}
      {effectiveModel && (
        <div className="space-y-2">
          <FieldLabel
            id={`${editorNamePrefix}-provider-options`}
            label={
              isUsingInheritedOptions ? (
                <span className="text-muted-foreground italic">
                  Provider options <span className="text-xs">(inherited)</span>
                </span>
              ) : (
                'Provider options'
              )
            }
          />
          <StandaloneJsonEditor
            name={`${editorNamePrefix}-provider-options`}
            onChange={handleProviderOptionsStringChange}
            value={
              typeof effectiveProviderOptions === 'string'
                ? effectiveProviderOptions
                : effectiveProviderOptions
                  ? JSON.stringify(effectiveProviderOptions, null, 2)
                  : ''
            }
            placeholder={jsonPlaceholder}
            customTemplate={jsonPlaceholder}
            readOnly={disabled || isUsingInheritedOptions}
          />
        </div>
      )}

      {/* Allowed Providers */}
      {capabilities?.modelFallback?.enabled &&
        effectiveModel &&
        isGatewayRoutable &&
        onAllowedProvidersChange && (
          <AllowedProvidersSection
            allowedProviders={allowedProviders}
            inheritedAllowedProviders={inheritedAllowedProviders}
            onAllowedProvidersChange={onAllowedProvidersChange}
            disabled={disabled}
          />
        )}

      {/* Fallback Models */}
      {capabilities?.modelFallback?.enabled &&
        effectiveModel &&
        isGatewayRoutable &&
        onFallbackModelsChange && (
          <FallbackModelsSection
            editorNamePrefix={editorNamePrefix}
            fallbackModels={fallbackModels}
            inheritedFallbackModels={inheritedFallbackModels}
            onFallbackModelsChange={onFallbackModelsChange}
            disabled={disabled}
          />
        )}
    </div>
  );
}
