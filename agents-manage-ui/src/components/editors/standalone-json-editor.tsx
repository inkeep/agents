'use client';

import { type FC, type ReactNode, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { createSchemaTemplate } from '@/lib/json-schema-validation';
import { formatJson } from '@/lib/utils';
import { JsonEditor } from '@/components/editors/json-editor';

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
  actions?: ReactNode;
}

export const StandaloneJsonEditor: FC<StandaloneJsonEditorProps> = ({
  value = '',
  onChange,
  actions: $actions,
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
      {$actions}
      {!value.trim() && (
        <Button
          type="button"
          onClick={handleInsertTemplate}
          variant="outline"
          size="sm"
          className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
        >
          Template
        </Button>
      )}
      <Button
        type="button"
        onClick={handleFormat}
        variant="outline"
        size="sm"
        className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
        disabled={!value.trim()}
      >
        Format
      </Button>
    </>
  );

  return (
    <JsonEditor value={value} onChange={onChange} {...props}>
      <div className="absolute end-2 top-2 flex gap-2 z-1">{actions}</div>
    </JsonEditor>
  );
};
