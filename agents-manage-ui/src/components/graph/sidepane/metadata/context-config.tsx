import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import type { ContextConfig, GraphMetadata } from '../../configuration/graph-types';
import { SectionHeader } from '../section';

export function ContextConfigForm({
  contextConfig,
  updateMetadata,
}: {
  contextConfig: ContextConfig;
  updateMetadata: (field: keyof GraphMetadata, value: GraphMetadata[keyof GraphMetadata]) => void;
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
        description="Configure dynamic context for this graph."
      />
      <div className="flex flex-col space-y-8">
        <ExpandableJsonEditor
          name="contextVariables"
          label="Context variables (JSON)"
          value={contextVariables}
          onChange={(value) => updateContextConfig('contextVariables', value)}
          placeholder="{}"
          className=""
        />
        <ExpandableJsonEditor
          name="headersSchema"
          label="Headers schema (JSON)"
          value={headersSchema}
          onChange={(value) => updateContextConfig('headersSchema', value)}
          placeholder="{}"
          className=""
        />
      </div>
    </div>
  );
}
