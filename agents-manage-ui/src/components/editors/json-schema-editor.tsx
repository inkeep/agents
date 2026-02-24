import type { ComponentProps, FC } from 'react';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { Switch } from '@/components/ui/switch';

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
  const isJsonSchemaModeChecked = useAgentStore((state) => state.jsonSchemaMode);
  const { setJsonSchemaMode } = useAgentActions();

  return (
    <div className="pt-2 flex flex-col gap-2">
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
      <span className="absolute flex items-center end-0 -top-[2.5px] gap-2 text-sm font-medium">
        JSON
        <Switch checked={isJsonSchemaModeChecked} onCheckedChange={setJsonSchemaMode} />
      </span>
    </div>
  );
};
