'use client';

import { Button } from '@/components/ui/button';
import { createLlmSchemaTemplate } from '@/lib/json-schema-validation';
import { formatJson } from '@/lib/utils';
import { JsonEditor } from './json-editor';

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
  const handleFormat = () => {
    const value = props.value;
    if (value?.trim()) {
      const formatted = formatJson(value);
      props.onChange(formatted);
    }
  };

  const handleInsertTemplate = () => {
    const template = createLlmSchemaTemplate();
    props.onChange(template);
  };

  return (
    <div
      data-slot="json-editor"
      className={`space-y-3 relative overflow-hidden p-1 ${props.className || ''}`}
    >
      <div className="flex items-center gap-2 absolute top-3 right-3 z-10">
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
      </div>

      <JsonEditor
        value={props.value || ''}
        onChange={props.onChange}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
      />
    </div>
  );
}
