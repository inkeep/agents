'use client';

import { type FC, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { createSchemaTemplate } from '@/lib/json-schema-validation';
import { cn, formatJson } from '@/lib/utils';
import { JsonEditor } from './json-editor';
import { JsonEditor as JsonEditor2 } from '@/components/editors/json-editor';

interface StandaloneJsonEditorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  readOnly?: boolean;
  'aria-invalid'?: boolean;
}

export const StandaloneJsonEditor: FC<StandaloneJsonEditorProps> = ({
  value = '',
  onChange,
  placeholder,
  disabled,
  readOnly,
  className,
  'aria-invalid': ariaInvalid,
  ...props
}) => {
  const handleFormat = useCallback(() => {
    if (value.trim()) {
      const formatted = formatJson(value);
      onChange(formatted);
    }
  }, [onChange, value]);

  const handleInsertTemplate = useCallback(() => {
    const template = createSchemaTemplate();
    onChange(template);
  }, [onChange]);

  const actions = (
    <>
      {!value.trim() && (
        <Button
          type="button"
          onClick={handleInsertTemplate}
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs rounded-sm"
        >
          Template
        </Button>
      )}
      <Button
        type="button"
        onClick={handleFormat}
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs rounded-sm"
        disabled={!value.trim()}
      >
        Format
      </Button>
    </>
  );

  return (
    <>
      <JsonEditor2
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={ariaInvalid}
        uri="foo.json"
      >
        <div className="absolute end-2 top-2 flex gap-2 z-1">{actions}</div>
      </JsonEditor2>
      <div
        data-slot="json-editor"
        className={cn('space-y-3 relative overflow-hidden p-1', className)}
      >
        <div className="flex items-center gap-2 absolute top-3 right-3 z-10">{actions}</div>
        <JsonEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={ariaInvalid}
        />
      </div>
    </>
  );
};
