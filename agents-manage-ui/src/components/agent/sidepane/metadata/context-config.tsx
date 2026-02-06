import type { FC } from 'react';
import { GenericJsonEditor } from '@/components/editors/standalone-json-editor';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { contextVariablesTemplate, headersSchemaTemplate } from '@/lib/templates';
import { isRequired } from '@/lib/utils';
import { FullAgentUpdateSchema as schema } from '@/lib/validation';
import { SectionHeader } from '../section';

export const ContextConfigForm: FC = () => {
  'use memo';
  const form = useFullAgentFormContext();

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Context configuration"
        description="Configure dynamic context for this agent."
      />
      <GenericJsonEditor
        control={form.control}
        name="contextConfig.contextVariables"
        label="Context variables (JSON)"
        placeholder="{}"
        customTemplate={contextVariablesTemplate}
        isRequired={isRequired(schema, 'contextConfig.contextVariables')}
      />
      <GenericJsonEditor
        control={form.control}
        name="contextConfig.headersSchema"
        label="Headers schema (JSON)"
        placeholder="{}"
        customTemplate={headersSchemaTemplate}
        isRequired={isRequired(schema, 'contextConfig.headersSchema')}
      />
    </div>
  );
};
