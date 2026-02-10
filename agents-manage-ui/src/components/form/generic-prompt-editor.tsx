import type { FieldPath, FieldValues } from 'react-hook-form';
import type { FormFieldWrapperProps } from '@/components/form/form-field-wrapper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize } from 'lucide-react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { cn } from '@/lib/utils';
import { AddVariableAction } from '@/components/editors/expandable-prompt-editor';

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
