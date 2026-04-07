import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AzureConfigurationSectionProps {
  providerOptions: Record<string, unknown> | string | undefined;
  onProviderOptionsChange: (value: string) => void;
  disabled?: boolean;
}

export function AzureConfigurationSection({
  providerOptions = {},
  onProviderOptionsChange,
  disabled = false,
}: AzureConfigurationSectionProps) {
  const providerOptionsObj =
    providerOptions && typeof providerOptions === 'string'
      ? JSON.parse(providerOptions)
      : providerOptions;

  const handleFieldChange = (field: string, value: string) => {
    const updatedOptions = {
      ...providerOptionsObj,
      [field]: value || undefined,
    };

    // Remove undefined values to keep JSON clean
    for (const key of Object.keys(updatedOptions)) {
      if (updatedOptions[key] === undefined) {
        delete updatedOptions[key];
      }
    }

    const finalValue = Object.keys(updatedOptions).length
      ? JSON.stringify(updatedOptions, null, 2)
      : '';
    onProviderOptionsChange(finalValue);
  };

  const resourceNameId = useId();
  const baseUrlId = useId();

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <h4 className="text-sm font-medium text-foreground">Azure OpenAI Configuration</h4>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Choose one connection method <span className="text-red-500">*</span>
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={resourceNameId} className="text-sm font-medium">
                Resource Name
              </Label>
              <Input
                id={resourceNameId}
                type="text"
                value={providerOptionsObj.resourceName || ''}
                onChange={(e) => handleFieldChange('resourceName', e.target.value)}
                placeholder="my-azure-openai"
                className="text-sm"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Azure OpenAI resource name (for standard deployments)
              </p>
            </div>

            <div className="text-center text-xs text-muted-foreground">— OR —</div>

            <div className="space-y-2">
              <Label htmlFor={baseUrlId} className="text-sm font-medium">
                Base URL
              </Label>
              <Input
                id={baseUrlId}
                type="text"
                value={providerOptionsObj.baseURL || ''}
                onChange={(e) => handleFieldChange('baseURL', e.target.value)}
                placeholder="https://my-resource.openai.azure.com"
                className="text-sm"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Custom base URL (alternative to resource name)
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          <strong>Note:</strong> You must provide either <em>Resource Name</em> (for standard Azure
          OpenAI deployments) or <em>Base URL</em> (for custom endpoints). API keys should be set
          via the <code>AZURE_OPENAI_API_KEY</code> environment variable.
        </p>
      </div>
    </div>
  );
}
