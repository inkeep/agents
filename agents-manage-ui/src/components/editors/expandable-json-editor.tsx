'use client';

import { type ComponentPropsWithoutRef, useEffect, useState } from 'react';
import { JsonEditor } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { cn, formatJson } from '@/lib/utils';
import { ExpandableField } from '../form/expandable-field';

const noop = () => {};

type JsonEditorProps = ComponentPropsWithoutRef<typeof JsonEditor>;

interface ExpandableJsonEditorProps {
  name: string;
  value: NonNullable<JsonEditorProps['value']>;
  className?: JsonEditorProps['className'];
  label?: string;
  error?: string;
  placeholder?: JsonEditorProps['placeholder'];
  editorOptions?: JsonEditorProps['editorOptions'];
  readOnly?: boolean;
  onChange?: JsonEditorProps['onChange'];
  defaultOpen?: boolean;
}

// Shared JSON validation logic
const useJsonValidation = (value = '') => {
  const [error, setError] = useState('');

  useEffect(() => {
    if (!value.trim()) {
      setError('');
      return;
    }

    try {
      JSON.parse(value);
      setError('');
    } catch {
      setError('Invalid JSON syntax');
    }
  }, [value]);

  return { error };
};

// Shared format handler
const useJsonFormat = (value: string, hasError: boolean, onChange?: (value: string) => void) => {
  const handleFormat = () => {
    if (!hasError && value?.trim()) {
      const formatted = formatJson(value);
      onChange?.(formatted);
    }
  };

  return { handleFormat, canFormat: !hasError && !!value?.trim() };
};

export function ExpandableJsonEditor({
  name,
  value,
  onChange,
  className,
  label = 'JSON',
  placeholder = 'Enter valid JSON...',
  error: externalError,
  readOnly,
  editorOptions,
  defaultOpen = false,
}: ExpandableJsonEditorProps) {
  const { error: internalError } = useJsonValidation(value);
  const handleChange = onChange ?? noop;
  const { handleFormat, canFormat } = useJsonFormat(
    value,
    !!(externalError || internalError),
    onChange
  );
  const [open, setOpen] = useState(defaultOpen);
  const uri = `${open ? 'expanded-' : ''}${name}.json` as const;
  const error = externalError || internalError;
  const id = `${name}-label`;
  return (
    <ExpandableField
      id={id}
      open={open}
      onOpenChange={setOpen}
      uri={uri}
      label={label}
      className={className}
      hasError={!!error}
      actions={
        !readOnly && (
          <Button
            type="button"
            onClick={handleFormat}
            disabled={!canFormat}
            variant="link"
            size="sm"
            className="text-xs rounded-sm h-6"
          >
            Format
          </Button>
        )
      }
    >
      <JsonEditor
        uri={uri}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        className={cn(!open && error && 'max-h-96')}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        readOnly={readOnly}
        editorOptions={editorOptions}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </ExpandableField>
  );
}
