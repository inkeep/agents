'use client';

import { type ComponentPropsWithoutRef, useState } from 'react';
import { CodeEditor } from '@/components/editors/code-editor';
import { cn } from '@/lib/utils';
import { ExpandableField } from '../form/expandable-field';

type CodeEditorProps = ComponentPropsWithoutRef<typeof CodeEditor>;

interface ExpandableCodeEditorProps {
  name: string;
  value: NonNullable<CodeEditorProps['value']>;
  onChange: NonNullable<CodeEditorProps['onChange']>;
  className?: CodeEditorProps['className'];
  label: string;
  isRequired?: boolean;
  error?: string;
  placeholder?: CodeEditorProps['placeholder'];
}

export function ExpandableCodeEditor({
  name,
  value,
  onChange,
  className,
  label,
  placeholder,
  error,
  isRequired,
}: ExpandableCodeEditorProps) {
  const [open, setOpen] = useState(false);
  const uri = `${open ? 'small' : 'full'}-${name}.jsx` as const;
  const id = `${name}-label`;
  return (
    <ExpandableField
      id={id}
      open={open}
      onOpenChange={setOpen}
      uri={uri}
      label={label}
      className={className}
      isRequired={isRequired}
      hasError={!!error}
    >
      <CodeEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        hasDynamicHeight={!open}
        className={cn(!open && error && 'max-h-96')}
        aria-labelledby={id}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ExpandableField>
  );
}
