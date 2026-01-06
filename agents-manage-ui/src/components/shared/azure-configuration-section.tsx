import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AzureConfigurationSectionProps {
  providerOptions: Record<string, unknown> | string | undefined;
  onProviderOptionsChange?: (value: string | undefined) => void;
  editorNamePrefix: string;
}

export function AzureConfigurationSection({
  providerOptions,
  onProviderOptionsChange,
  editorNamePrefix,
}: AzureConfigurationSectionProps) {
  const providerOptionsObj =
    typeof providerOptions === 'string'
      ? JSON.parse(providerOptions || '{}')
      : providerOptions || {};

  const handleFieldChange = (field: string, value: string) => {
    if (!onProviderOptionsChange) return;

    const updatedOptions = {
      ...providerOptionsObj,
      [field]: value || undefined,
    };

    // Remove undefined values to keep JSON clean
    Object.keys(updatedOptions).forEach((key) => {
      if (updatedOptions[key] === undefined) {
        delete updatedOptions[key];
      }
    });

    onProviderOptionsChange(
      Object.keys(updatedOptions).length > 0 ? JSON.stringify(updatedOptions, null, 2) : undefined
    );
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <h4 className="text-sm font-medium text-foreground">Azure OpenAI Configuration</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label
            htmlFor={`${editorNamePrefix}-azure-resource-name`}
            className="text-sm font-medium"
          >
            Resource Name
          </Label>
          <Input
            id={`${editorNamePrefix}-azure-resource-name`}
            type="text"
            value={providerOptionsObj.resourceName || ''}
            onChange={(e) => handleFieldChange('resourceName', e.target.value)}
            placeholder="my-azure-openai"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Azure OpenAI resource name (for standard deployments)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${editorNamePrefix}-azure-base-url`} className="text-sm font-medium">
            Base URL
          </Label>
          <Input
            id={`${editorNamePrefix}-azure-base-url`}
            type="text"
            value={providerOptionsObj.baseURL || ''}
            onChange={(e) => handleFieldChange('baseURL', e.target.value)}
            placeholder="https://my-resource.openai.azure.com"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Custom base URL (alternative to resource name)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${editorNamePrefix}-azure-api-version`} className="text-sm font-medium">
            API Version
          </Label>
          <Input
            id={`${editorNamePrefix}-azure-api-version`}
            type="text"
            value={providerOptionsObj.apiVersion || ''}
            onChange={(e) => handleFieldChange('apiVersion', e.target.value)}
            placeholder="2024-10-21"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Azure OpenAI API version (optional, uses SDK default if not specified)
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> Provide either <em>Resource Name</em> (for standard Azure OpenAI
          deployments) or <em>Base URL</em> (for custom endpoints). API keys should be set via the{' '}
          <code>AZURE_OPENAI_API_KEY</code> environment variable.
        </p>
      </div>
    </div>
  );
}
