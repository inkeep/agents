'use client';

import type { ComponentPropsWithoutRef, FC } from 'react';
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
  const commonProps = {
    id: name,
    value,
    onChange,
    placeholder,
    'aria-invalid': !!error,
  };

  return (
    <ExpandableField
      name={name}
      label={label}
      className={className}
      isRequired={isRequired}
      compactView={
        <>
          <CodeEditor
            {...commonProps}
            editorOptions={{
              padding: {
                top: 12,
                bottom: 36,
              },
            }}
            className={cn(error && 'max-h-96 mb-6')}
          />
          {error && <p className="text-sm mt-1 text-destructive absolute -bottom-6">{error}</p>}
        </>
      }
      expandedView={
        <ExpandedCodeEditor {...commonProps} autoFocus hasDynamicHeight={false} error={error} />
      }
    />
  );
}
