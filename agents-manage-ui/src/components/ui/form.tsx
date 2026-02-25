'use client';

import type * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { type ComponentProps, createContext, use, useId } from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

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

const useFormField = () => {
  const fieldContext = use(FormFieldContext);
  const itemContext = use(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField must be used within a <FormField />');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId();

  return (
    <FormItemContext value={{ id }}>
      <div data-slot="form-item" className={cn('grid gap-2', className)} {...props} />
    </FormItemContext>
  );
}

function FormLabel({
  className,
  isRequired,
  children,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root> & {
  isRequired?: boolean;
}) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive gap-1', className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {isRequired && <span className="text-red-500">*</span>}
    </Label>
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

function firstNestedMessage(node: unknown, path: string[] = []): string | undefined {
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

  for (const [key, value] of Object.entries(node)) {
    const msg = firstNestedMessage(value, [...path, key]);
    if (msg) {
      return msg;
    }
  }
}

function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();

  const body = firstNestedMessage(error) || children;

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
