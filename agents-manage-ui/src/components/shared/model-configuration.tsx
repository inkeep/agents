'use client';

import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { AzureConfigurationSection } from './azure-configuration-section';

interface ModelConfigurationProps {
  /** Current model value */
  value?: string;
  /** Provider options value (JSON string or object) */
  providerOptions?: string | Record<string, unknown>;
  /** Inherited/default model value to show when no value is set */
  inheritedValue?: string;
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
}

export function ModelConfiguration({
  value,
  providerOptions,
  inheritedValue,
  label,
  description,
  placeholder = 'Select a model...',
  canClear = true,
  isRequired = false,
  onModelChange,
  onProviderOptionsChange,
  editorNamePrefix = 'model',
  getJsonPlaceholder,
}: ModelConfigurationProps) {
  const handleModelChange = (modelValue: string) => {
    const previousModel = value;
    const newModel = modelValue || undefined;

    // Clear provider options when switching between different provider types or models
    const previousProvider = previousModel?.includes('/') ? previousModel.split('/')[0] : null;
    const newProvider = newModel?.includes('/') ? newModel.split('/')[0] : null;

    // Clear if switching between different providers, or switching from custom/gateway/etc to built-in models
    if (
      (previousProvider && newProvider && previousProvider !== newProvider) ||
      (previousProvider && !newProvider) ||
      (!previousProvider && newProvider)
    ) {
      onProviderOptionsChange?.(undefined);
    }

    onModelChange?.(newModel || '');
  };

  const handleProviderOptionsChange = (options: Record<string, any>) => {
    const jsonString = JSON.stringify(options, null, 2);
    onProviderOptionsChange?.(jsonString);
  };

  const getDefaultJsonPlaceholder = (model?: string) => {
    if (model?.startsWith('azure/')) {
      return `{
  "resourceName": "your-azure-resource",
  "temperature": 0.7,
  "maxOutputTokens": 2048
}`;
    }
    return `{
  "temperature": 0.7,
  "maxOutputTokens": 2048
}`;
  };

  const jsonPlaceholder = getJsonPlaceholder
    ? getJsonPlaceholder(value)
    : getDefaultJsonPlaceholder(value);

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
        />
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {/* Provider Options JSON Editor */}
      {value && (
        <ExpandableJsonEditor
          name={`${editorNamePrefix}-provider-options`}
          label="Provider options"
          onChange={onProviderOptionsChange || (() => {})}
          value={
            typeof providerOptions === 'string'
              ? providerOptions
              : providerOptions
                ? JSON.stringify(providerOptions, null, 2)
                : ''
          }
          placeholder={jsonPlaceholder}
          readOnly={false}
        />
      )}

      {/* Azure Configuration Fields */}
      {value?.startsWith('azure/') && (
        <AzureConfigurationSection
          providerOptions={providerOptions}
          onProviderOptionsChange={onProviderOptionsChange}
          editorNamePrefix={editorNamePrefix}
        />
      )}
    </div>
  );
}
