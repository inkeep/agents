'use client';

import { type ComponentPropsWithoutRef, type FC, useState } from 'react';
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

const ExpandedCodeEditor: FC<CodeEditorProps & { error?: string }> = ({ error, id, ...props }) => {
  return (
    <>
      <CodeEditor {...props} id={`${id}-expanded`} />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </>
  );
};

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

  return (
    <ExpandableField
      open={open}
      onOpenChange={setOpen}
      name={name}
      label={label}
      className={className}
      isRequired={isRequired}
    >
      <CodeEditor
        id={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={!!error}
        editorOptions={{
          padding: {
            top: 12,
            bottom: 46,
          },
        }}
        hasDynamicHeight={!open}
        className={cn(error && 'max-h-96 mb-6')}
      />
      {error && <p className="text-sm mt-1 text-destructive absolute -bottom-6">{error}</p>}
    </ExpandableField>
  );
}
