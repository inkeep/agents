'use client';

import { useEffect, useRef, useState } from 'react';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { azureModelProviderOptionsTemplate, providerOptionsTemplate } from '@/lib/templates';
import { FieldLabel } from '../agent/sidepane/form-components/label';
import { AzureConfigurationSection } from './azure-configuration-section';

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
}: ModelConfigurationProps) {
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
    </div>
  );
}
