'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { createSchemaTemplate } from '@/lib/json-schema-validation';
import { cn, formatJson } from '@/lib/utils';
import { JsonEditor } from './json-editor';
import { JsonEditor as JsonEditor2 } from '@/components/traces/editors/json-editor';

interface StandaloneJsonEditorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  readOnly?: boolean;
}

export function StandaloneJsonEditor(props: StandaloneJsonEditorProps) {
  const handleFormat = useCallback(() => {
    if (props.value?.trim()) {
      const formatted = formatJson(props.value);
      props.onChange(formatted);
    }
  }, [props.onChange, props.value]);

  const handleInsertTemplate = useCallback(() => {
    const template = createSchemaTemplate();
    props.onChange(template);
  }, [props.onChange]);

  const actions = (
    <>
      {!props.value?.trim() && (
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
        disabled={!props.value?.trim()}
      >
        Format
      </Button>
    </>
  );

  return (
    <>
      <JsonEditor2
        value={props.value || ''}
        onChange={props.onChange}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        uri="foo.json"
      >
        <div className="absolute end-2 top-2 flex gap-2 z-1">{actions}</div>
      </JsonEditor2>
      <div
        data-slot="json-editor"
        className={cn('space-y-3 relative overflow-hidden p-1', props.className)}
      >
        <div className="flex items-center gap-2 absolute top-3 right-3 z-10">{actions}</div>
        <JsonEditor
          value={props.value || ''}
          onChange={props.onChange}
          placeholder={props.placeholder}
          disabled={props.disabled}
          readOnly={props.readOnly}
        />
      </div>
    </>
  );
}
