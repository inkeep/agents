'use client';

import { type ComponentPropsWithoutRef, useEffect, useState } from 'react';
import { JsonEditor } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { cn, formatJson } from '@/lib/utils';
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
const useJsonFormat = (value: string, onChange: (value: string) => void, hasError: boolean) => {
  const handleFormat = () => {
    if (!hasError && value?.trim()) {
      const formatted = formatJson(value);
      onChange(formatted);
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
}: ExpandableJsonEditorProps) {
  const { error: internalError } = useJsonValidation(value);
  const { handleFormat, canFormat } = useJsonFormat(
    value,
    onChange,
    !!(externalError || internalError)
  );
  const [open, setOpen] = useState(false);

  const error = externalError || internalError;

  return (
    <ExpandableField
      open={open}
      onOpenChange={setOpen}
      name={name}
      label={label}
      className={className}
      actions={
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
      }
    >
      <JsonEditor
        id={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(!open && error && 'max-h-96')}
        hasDynamicHeight={!open}
      />
      {error && <p className="text-sm mt-1 text-destructive absolute -bottom-6">{error}</p>}
    </ExpandableField>
  );
}
