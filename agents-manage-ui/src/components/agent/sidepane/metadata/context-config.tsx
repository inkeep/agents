import { type FC, useEffect } from 'react';
import { ContextConfigSchema as schema } from '@/components/agent/form/validation';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { contextVariablesTemplate, headersSchemaTemplate } from '@/lib/templates';
import { isRequired } from '@/lib/utils';
import { SectionHeader } from '../section';

const HeadersSchema = schema.shape.headersSchema;
const ContextVariablesSchema = schema.shape.contextVariables;

export const ContextConfigForm: FC = () => {
  'use memo';
  const form = useFullAgentFormContext();
  const { setVariableSuggestions } = useAgentActions();

  // biome-ignore lint/correctness/useExhaustiveDependencies: -- only on mount
  useEffect(() => {
    // make sure to unsubscribe;
    return form.subscribe({
      name: ['contextConfig.contextVariables', 'contextConfig.headersSchema'],
      formState: { values: true },
      callback(data) {
        const config = data.values.contextConfig;

        const headersSchema = HeadersSchema.safeParse(config?.headersSchema).data;
        const contextVariables = ContextVariablesSchema.safeParse(config?.contextVariables).data;

        // Generate suggestions from context config
        const variables = getContextSuggestions({
          headersSchema,
          // @ts-expect-error improve types
          contextVariables,
        });
        setVariableSuggestions(variables);
      },
    });
  }, []);

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
        isRequired={isRequired(schema, 'contextVariables')}
      />
      <GenericJsonEditor
        control={form.control}
        name="contextConfig.headersSchema"
        label="Headers schema (JSON)"
        placeholder="{}"
        customTemplate={headersSchemaTemplate}
        isRequired={isRequired(schema, 'headersSchema')}
      />
    </div>
  );
};
