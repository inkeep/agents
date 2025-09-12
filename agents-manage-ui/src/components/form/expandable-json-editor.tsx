'use client';

import { useEffect, useState } from 'react';
import { JsonEditor } from '@/components/form/json-editor';
import { Button } from '@/components/ui/button';
import { formatJson } from '@/lib/utils';
import { ExpandableField } from './expandable-field';

interface ExpandableJsonEditorProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
  error?: string;
  placeholder?: string;
}

// Shared JSON validation logic
const useJsonValidation = (value: string) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value?.trim()) {
      setError(null);
      return;
    }

    try {
      JSON.parse(value);
      setError(null);
    } catch (_error) {
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

function ExpandedJsonEditor({
  value,
  onChange,
  placeholder,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name: string;
}) {
  const { error } = useJsonValidation(value);

  return (
    <div className="flex flex-col min-h-0 w-full h-full">
      <JsonEditor
        id={`${name}-expanded`}
        autoFocus
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        className="[&>.cm-editor]:max-h-full"
      />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}

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
            id={name}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className={`font-mono text-sm max-h-96 ${error ? 'mb-6' : ''}`}
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
