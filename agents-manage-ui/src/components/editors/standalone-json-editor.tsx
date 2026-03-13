'use client';

import type { ComponentProps, FC } from 'react';
import { JsonEditor } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { basicSchemaTemplate } from '@/lib/templates';

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
  uri,
  ...props
}) => {
  'use memo';
  const monaco = useMonacoStore((state) => state.monaco);

  return (
    <JsonEditor
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      // Construct uri from name if not provided (matches ExpandableJsonEditor behavior)
      uri={uri ?? (name ? (`${name}.json` as const) : undefined)}
      {...props}
    >
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
