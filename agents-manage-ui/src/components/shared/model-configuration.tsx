'use client';

import { Plus, X } from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { Button } from '@/components/ui/button';
import { useCapabilitiesQuery } from '@/lib/query/capabilities';
import { azureModelProviderOptionsTemplate, providerOptionsTemplate } from '@/lib/templates';
import { FieldLabel } from '../agent/sidepane/form-components/label';
import { AzureConfigurationSection } from './azure-configuration-section';

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
              placeholder="Select fallback model..."
              canClear={false}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setShowPendingSelector(false)}
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
          disabled={disabled}
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
  onProviderOptionsChange?: (value: string | undefined) => void;
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
}: ModelConfigurationProps) {
  const { data: capabilities } = useCapabilitiesQuery();
  // Internal state for provider options to handle immediate updates
  const [internalProviderOptions, setInternalProviderOptions] = useState<
    string | Record<string, unknown> | undefined
  >(providerOptions);

  // Sync internal state when prop changes or when switching from inherited to explicit
  useEffect(() => {
    setInternalProviderOptions(providerOptions);
  }, [providerOptions]);

  // Clear internal state when model becomes explicit (value changes from undefined to defined)
  const previousValue = useRef(value);
  useEffect(() => {
    const wasInherited = previousValue.current === undefined && inheritedValue !== undefined;
    const isNowExplicit = value !== undefined;

    if (wasInherited && isNowExplicit) {
      setInternalProviderOptions(undefined);
    }

    previousValue.current = value;
  }, [value, inheritedValue]);

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
      onProviderOptionsChange?.(undefined);
    }

    onModelChange?.(newModel || '');
  };

  const handleProviderOptionsChange = (options: Record<string, any>) => {
    if (!options || Object.keys(options).length === 0) {
      setInternalProviderOptions(undefined);
      onProviderOptionsChange?.(undefined);
      return;
    }
    const jsonString = JSON.stringify(options, null, 2);
    setInternalProviderOptions(jsonString);
    onProviderOptionsChange?.(jsonString);
  };

  // Handle both string (from JSON editors) and object (from ModelSelector) inputs
  const handleProviderOptionsStringChange = (value: string | undefined) => {
    // Don't update with empty string if we have valid internal state
    if (value === '' && internalProviderOptions && internalProviderOptions !== '') {
      return;
    }

    setInternalProviderOptions(value);
    onProviderOptionsChange?.(value);
  };

  const getDefaultJsonPlaceholder = (model?: string) => {
    if (model?.startsWith('azure/')) {
      return azureModelProviderOptionsTemplate;
    }
    return providerOptionsTemplate;
  };

  const effectiveModel = value || inheritedValue;
  const effectiveProviderOptions = value ? internalProviderOptions : inheritedProviderOptions;
  const isUsingInheritedOptions = !value && !!inheritedValue;

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

      {/* Fallback Models */}
      {capabilities?.modelFallback?.enabled && effectiveModel && onFallbackModelsChange && (
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
