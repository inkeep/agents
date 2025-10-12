'use client';

import { type ComponentPropsWithoutRef, type FC, useEffect, useState } from 'react';
import { JsonEditor } from '@/components/form/json-editor';
import { JsonEditor as JsonEditor2 } from '@/components/editors/json-editor';
import { Button } from '@/components/ui/button';
import { cn, formatJson } from '@/lib/utils';
import { ExpandableField } from './expandable-field';

type JsonEditorProps = ComponentPropsWithoutRef<typeof JsonEditor2>;

interface ExpandableJsonEditorProps {
  name: string;
  value: NonNullable<JsonEditorProps['value']>;
  onChange: NonNullable<JsonEditorProps['onChange']>;
  className: JsonEditorProps['className'];
  label?: string;
  error?: string;
  placeholder: JsonEditorProps['placeholder'];
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

type ExpandedJsonEditorProps = Pick<
  ExpandableJsonEditorProps,
  'value' | 'onChange' | 'placeholder' | 'name'
>;

const ExpandedJsonEditor: FC<ExpandedJsonEditorProps> = ({
  value,
  onChange,
  placeholder,
  name,
}) => {
  const { error } = useJsonValidation(value);
  return (
    <div className="h-full">
      <JsonEditor2
        id={`${name}-expanded`}
        autoFocus
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-full!"
        aria-invalid={!!error}
      />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
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
  const { error: internalError } = useJsonValidation(value);
  const { handleFormat, canFormat } = useJsonFormat(
    value,
    onChange,
    !!(externalError || internalError)
  );

  const error = externalError || internalError;

  const formatButton = (
    <Button
      type="button"
      onClick={handleFormat}
      disabled={!canFormat}
      variant="outline"
      size="sm"
      className="h-6 px-2 text-xs rounded-sm"
    >
      Format
    </Button>
  );

  return (
    <ExpandableField
      name={name}
      label={label}
      className={className}
      actions={formatButton}
      compactView={
        <>
          <JsonEditor
            aria-invalid={!!error}
            id={name}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className={cn('font-mono bg-background text-sm max-h-96', error && 'mb-6')}
          />
          {error && <p className="text-sm mt-1 text-destructive absolute -bottom-6">{error}</p>}
        </>
      }
      expandedView={
        <ExpandedJsonEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          name={name}
        />
      }
    />
  );
}
