'use client';

import type * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { type ComponentProps, createContext, use, useId } from 'react';
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form';
import { Controller, FormProvider, useFormContext, useFormState } from 'react-hook-form';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { cn } from '@/lib/utils';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TV = FieldValues,
>(
  props: ControllerProps<TFieldValues, TName, TV>
) => {
  return (
    <FormFieldContext value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext>
  );
};

function useFormField() {
  const fieldContext = use(FormFieldContext);
  const itemContext = use(FormItemContext);
  if (!fieldContext) {
    throw new Error('useFormField must be used within a <FormField />');
  }
  if (!itemContext) {
    throw new Error('useFormField must be used within a <FormItem />');
  }
  const { name } = fieldContext;
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name });
  const fieldState = getFieldState(name, formState);
  const { id } = itemContext;

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue | null>(null);

function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId();

  return (
    <FormItemContext value={{ id }}>
      <div data-slot="form-item" className={cn('grid gap-2', className)} {...props} />
    </FormItemContext>
  );
}

function FormLabel({
  children,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root> & {
  isRequired?: boolean;
  tooltip?: string;
}) {
  const { error, formItemId } = useFormField();

  return (
    <FieldLabel
      data-slot="form-label"
      error={!!error}
      id={formItemId}
      label={children}
      {...props}
    />
  );
}

function FormControl(props: ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-xs', className)}
      {...props}
    />
  );
}

export function flatNestedFieldMessage(node: unknown, path: string[] = []): string | undefined {
  if (!node || typeof node !== 'object') return;

  if ('message' in node && typeof node.message === 'string') {
    if (!path.length) {
      return node.message;
    }
    const fieldPath = path.map((p) => JSON.stringify(p)).join(', ');
    const pathLike = path.length > 1 ? `[${fieldPath}]` : fieldPath;

    return `${node.message}
  → at ${/* z.prettifyError like format  */ pathLike}`;
  }

  return Object.entries(node)
    .flatMap(([key, value]) => {
      const msg = flatNestedFieldMessage(value, [...path, key]);
      return msg ? [msg] : [];
    })
    .join('\n');
}

function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();

  const body = flatNestedFieldMessage(error) || children;

  if (!body) {
    return;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn(
        'text-destructive text-sm',
        // respect \n in message
        'whitespace-pre-wrap break-all',
        className
      )}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
