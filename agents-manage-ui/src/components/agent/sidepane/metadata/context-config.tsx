import { type FC, useEffect } from 'react';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { contextVariablesTemplate, headersSchemaTemplate } from '@/lib/templates';
import { FullAgentUpdateSchema as schema } from '@/lib/types/agent-full';
import { isRequired } from '@/lib/utils';
import { SectionHeader } from '../section';

function tryJsonParse(json = ''): Record<string, any> {
  try {
    if (json.trim()) {
      return JSON.parse(json);
    }
  } catch {}
  return {};
}

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
      callback({ values }) {
        // Generate suggestions from context config
        const variables = getContextSuggestions({
          headersSchema: tryJsonParse(values.contextConfig?.headersSchema),
          contextVariables: tryJsonParse(values.contextConfig?.contextVariables),
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
