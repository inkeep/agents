'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { Switch } from '@/components/ui/switch';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';

interface JsonSchemaEditorProps
  extends ComponentProps<typeof StandaloneJsonEditor>,
    Pick<ComponentProps<typeof JsonSchemaBuilder>, 'hasInPreview' | 'allRequired'> {
  value: string;
}

export const JsonSchemaEditor: FC<JsonSchemaEditorProps> = ({
  hasInPreview,
  allRequired,
  ...props
}) => {
  'use memo';
  const isJsonSchemaModeChecked = useAgentStore((state) => state.jsonSchemaMode);
  const { setJsonSchemaMode } = useAgentActions();
  const id = useId();

  return (
    <div className="pt-2 flex flex-col gap-2 min-w-0">
      {isJsonSchemaModeChecked ? (
        <StandaloneJsonEditor {...props} />
      ) : (
        <JsonSchemaBuilder
          value={props.value}
          onChange={props.onChange}
          readOnly={props.readOnly}
          hasError={!!props['aria-invalid']}
          hasInPreview={hasInPreview}
          allRequired={allRequired}
        />
      )}
      <label
        htmlFor={id}
        className="absolute flex items-center end-0 -top-[2.5px] gap-2 text-sm font-medium cursor-pointer"
      >
        JSON
        <Switch id={id} checked={isJsonSchemaModeChecked} onCheckedChange={setJsonSchemaMode} />
      </label>
    </div>
  );
};
