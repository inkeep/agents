import { Braces, Maximize } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { useState } from 'react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { ExpandableField } from '@/components/form/expandable-field';
import { Button } from '@/components/ui/button';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import type { FormFieldWrapperProps } from '@/components/form/form-field-wrapper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type PromptEditorProps = ComponentProps<typeof PromptEditor> & {
  name: string;
};

const AddVariableAction: FC<{ uri: string; className?: string }> = ({ uri, className }) => {
  const monaco = useMonacoStore((state) => state.monaco);

  const handleAddVariable = () => {
    if (!monaco) {
      return;
    }
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    const [editor] = monaco.editor.getEditors().filter((editor) => editor.getModel() === model);
    if (!editor) {
      return;
    }

    const selection = editor.getSelection();
    const pos = selection ? selection.getStartPosition() : editor.getPosition();
    if (!pos) return;

    const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    editor.executeEdits('insert-template-variable', [{ range, text: '{' }]);
    editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
    editor.focus();
    editor.trigger('insert-template-variable', 'editor.action.triggerSuggest', {});
  };

  return (
    <Button
      size="sm"
      variant="link"
      className={cn('text-xs rounded-sm h-6', className)}
      type="button"
      onClick={handleAddVariable}
    >
      <Braces className="size-3.5" />
      Add variables
    </Button>
  );
};

export function ExpandablePromptEditor({
  label,
  isRequired = false,
  className,
  error,
  name,
  ...props
}: {
  label: string;
  isRequired?: boolean;
  error?: string;
} & PromptEditorProps) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const uri = `${open ? 'expanded-' : ''}${name}.template` as const;
  const id = `${name}-label`;

  return (
    <ExpandableField
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      uri={uri}
      label={label}
      isRequired={isRequired}
      hasError={!!error}
      actions={<AddVariableAction uri={uri} />}
    >
      <PromptEditor
        uri={uri}
        autoFocus={open}
        aria-invalid={error ? 'true' : undefined}
        className={cn(!open && 'max-h-96', 'min-h-16', className)}
        hasDynamicHeight={!open}
        aria-labelledby={id}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ExpandableField>
  );
}

export function GenericPromptEditor<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
>({
  control,
  name,
  description,
  isRequired,
  label,
  className,
  placeholder,
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  className?: string;
  placeholder: string;
}) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const uri = `${open ? 'expanded-' : ''}${name}.template` as const;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const content = (
          <>
            <FormLabel isRequired={isRequired}>
              {label}
              <AddVariableAction uri={uri} className="ml-auto" />
              {!open && (
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" type="button" className="text-xs rounded-sm h-6">
                    <Maximize className="size-3.5" />
                    Expand
                  </Button>
                </DialogTrigger>
              )}
            </FormLabel>
            <FormControl>
              <PromptEditor
                uri={uri}
                autoFocus={open}
                className={cn(!open && 'max-h-96', 'min-h-16', className)}
                hasDynamicHeight={!open}
                placeholder={placeholder}
                // aria-labelledby={id}
                {...field}
              />
            </FormControl>
          </>
        );

        return (
          <FormItem>
            <Dialog open={open} onOpenChange={onOpenChange}>
              {content}
              <DialogContent
                size="fullscreen"
                className="!max-w-none h-screen w-screen max-h-screen p-0 gap-0 border-0 rounded-none"
              >
                <DialogTitle className="sr-only">{label}</DialogTitle>
                <DialogDescription className="sr-only">{`${label} Editor`}</DialogDescription>
                <div className="flex flex-col w-full px-8 pb-8 pt-12 mx-auto max-w-7xl min-w-0 gap-2">
                  {content}
                </div>
              </DialogContent>
            </Dialog>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
