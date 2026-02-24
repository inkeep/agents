'use client';

import type { ComponentProps, FC } from 'react';
import { JsonEditor } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { basicSchemaTemplate } from '@/lib/templates';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';

type JsonEditorProps = ComponentProps<typeof JsonEditor>;

interface StandaloneJsonEditorProps
  extends Pick<
    JsonEditorProps,
    | 'value'
    | 'placeholder'
    | 'disabled'
    | 'id'
    | 'className'
    | 'readOnly'
    | 'aria-invalid'
    | 'uri'
    | 'hasDynamicHeight'
  > {
  onChange: NonNullable<JsonEditorProps['onChange']>;
  name?: string;
  customTemplate?: string;
}

export const StandaloneJsonEditor: FC<StandaloneJsonEditorProps> = ({
  value = '',
  onChange,
  customTemplate = basicSchemaTemplate,
  name,
  readOnly,
  ...props
}) => {
  'use memo';
  // Construct uri from name if not provided (matches ExpandableJsonEditor behavior)
  const uri = props.uri ?? (name ? (`${name}.json` as const) : undefined);
  const monaco = useMonacoStore((state) => state.monaco);

  return (
    <JsonEditor value={value} onChange={onChange} readOnly={readOnly} uri={uri} {...props}>
      {!readOnly && (
        <Button
          type="button"
          onClick={() => {
            onChange(customTemplate);
          }}
          variant="outline"
          size="sm"
          className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
          disabled={!monaco}
        >
          Template
        </Button>
      )}
    </JsonEditor>
  );
};
