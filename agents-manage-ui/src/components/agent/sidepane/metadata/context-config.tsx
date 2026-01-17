import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { contextVariablesTemplate, headersSchemaTemplate } from '@/lib/templates';
import type { AgentMetadata, ContextConfig } from '../../configuration/agent-types';
import { FieldLabel } from '../form-components/label';
import { SectionHeader } from '../section';

export function ContextConfigForm({
  contextConfig,
  updateMetadata,
}: {
  contextConfig: ContextConfig;
  updateMetadata: (field: keyof AgentMetadata, value: AgentMetadata[keyof AgentMetadata]) => void;
}) {
  const { contextVariables, headersSchema } = contextConfig;

  const updateContextConfig = (field: keyof ContextConfig, value: string) => {
    const updatedContextConfig = {
      ...contextConfig,
      [field]: value,
    };
    updateMetadata('contextConfig', updatedContextConfig);
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Context configuration"
        description="Configure dynamic context for this agent."
      />
      <div className="flex flex-col space-y-8">
        <div className="space-y-2">
          <FieldLabel id="contextVariables" label="Context variables (JSON)" />
          <StandaloneJsonEditor
            name="contextVariables"
            value={contextVariables}
            onChange={(value) => updateContextConfig('contextVariables', value)}
            placeholder="{}"
            customTemplate={contextVariablesTemplate}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel id="headersSchema" label="Headers schema (JSON)" />
          <StandaloneJsonEditor
            name="headersSchema"
            value={headersSchema}
            onChange={(value) => updateContextConfig('headersSchema', value)}
            placeholder="{}"
            customTemplate={headersSchemaTemplate}
          />
        </div>
      </div>
    </div>
  );
}
