import { zodResolver } from '@hookform/resolvers/zod';
import { transformToJson } from '@inkeep/agents-core/client-exports';
import { render, screen, waitFor } from '@testing-library/react';
import { type FC, useEffect } from 'react';
import { type FieldPath, type FieldValues, type UseFormReturn, useForm } from 'react-hook-form';
import { z } from 'zod';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Form } from '@/components/ui/form';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { GenericComboBox } from '../generic-combo-box';
import '@/lib/utils/test-utils/styles.css';

const error = 'This field is required';

function getCommonProps<TFieldValues extends FieldValues, TTransformedValues = TFieldValues>(
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>,
  name: FieldPath<TFieldValues>
) {
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    name,
    control: form.control,
    placeholder: `${capitalizedName} placeholder`,
    label: `${capitalizedName} label`,
    isRequired: true,
  };
}

const testSchema = z.strictObject({
  input: z.string(error),
  textarea: z.string(error),
  select: z.string(error),
  combobox: z.string(error),
});

const TestForm: FC = () => {
  const resolver = zodResolver(testSchema);
  const form = useForm({ resolver });

  useEffect(() => {
    form.trigger();
  }, [form]);

  const divider = <hr style={{ borderColor: 'green' }} />;
  return (
    <Form {...form}>
      <form style={{ width: 320 }}>
        <GenericInput {...getCommonProps(form, 'input')} />
        {divider}
        <GenericTextarea {...getCommonProps(form, 'textarea')} />
        {divider}
        <GenericSelect {...getCommonProps(form, 'select')} options={[]} />
        {divider}
        <GenericComboBox {...getCommonProps(form, 'combobox')} options={[]} />
      </form>
    </Form>
  );
};

const nestedTestSchema = z.strictObject({
  jsonSchemaEditor: z
    .string()
    .transform(transformToJson)
    .pipe(
      z.strictObject({
        foo: z.strictObject({
          bar: z.strictObject({
            qux: z.string(error),
          }),
        }),
      })
    ),
});

const NestedTestForm: FC = () => {
  const resolver = zodResolver(nestedTestSchema);
  const form = useForm({
    defaultValues: {
      jsonSchemaEditor: JSON.stringify({ foo: { bar: {} } }),
    },
    resolver,
  });

  useEffect(() => {
    form.trigger();
  }, [form]);

  return (
    <Form {...form}>
      <form style={{ width: 320 }}>
        <JsonSchemaInput {...getCommonProps(form, 'jsonSchemaEditor')} />
      </form>
    </Form>
  );
};

describe('Form', () => {
  test('should properly highlight error state', async () => {
    const { container } = render(<TestForm />);

    await waitFor(() => {
      expect(screen.getAllByText(error)).toHaveLength(4);
    });

    await expect(container).toMatchScreenshot();
  }, 20_000);

  test('should properly highlight nested error state', async () => {
    agentStore.setState({ jsonSchemaMode: true });
    const { container } = render(<NestedTestForm />);

    await waitFor(() => {
      const message = container.querySelector<HTMLParagraphElement>('[data-slot="form-message"]');
      expect(message).toBeInTheDocument();
    });

    await expect(container).toMatchScreenshot();
  }, 20_000);
});
