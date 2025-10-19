'use client';

import type { ComponentPropsWithoutRef, FC } from 'react';
import { JsonEditor } from '@/components/editors/json-editor';
import { cn } from '@/lib/utils';
import { ExpandableField } from '../form/expandable-field';

type JsonEditorProps = ComponentPropsWithoutRef<typeof JsonEditor>;

interface ExpandableJsonEditorProps {
  name: string;
  value: NonNullable<JsonEditorProps['value']>;
  onChange: NonNullable<JsonEditorProps['onChange']>;
  className?: JsonEditorProps['className'];
  label?: string;
  error?: string;
  placeholder?: JsonEditorProps['placeholder'];
}

const ExpandedJsonEditor: FC<JsonEditorProps & { error?: string }> = ({ error, id, ...props }) => {
  return (
    <>
      <JsonEditor {...props} id={`${id}-expanded`} />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </>
  );
};

export function ExpandableJsonEditor({
  name,
  value,
  onChange,
  className,
  label = 'JSON',
  placeholder = 'Enter valid JSON...',
  error: externalError,
}: ExpandableJsonEditorProps) {
  const error = externalError;

  const commonProps = {
    id: name,
    value,
    onChange,
    placeholder,
    'aria-invalid': !!error,
  };

  return (
    <ExpandableField
      name={name}
      label={label}
      className={className}
      compactView={
        <>
          <JsonEditor
            {...commonProps}
            editorOptions={{
              fontSize: 14,
              padding: {
                top: 12,
                bottom: 36,
              },
            }}
            className={cn(error && 'max-h-96 mb-6')}
          />
          {error && <p className="text-sm mt-1 text-destructive absolute -bottom-6">{error}</p>}
        </>
      }
      expandedView={
        <ExpandedJsonEditor {...commonProps} autoFocus hasDynamicHeight={false} error={error} />
      }
    />
  );
}
