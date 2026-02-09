import { act, render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Form } from '@/components/ui/form';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { GenericComboBox } from '../generic-combo-box';
import '@/lib/utils/test-utils/styles.css';

function TestForm() {
  const error = 'This field is required';

  const form = useForm({
    errors: {
      input: { type: 'string', message: error },
      textarea: { type: 'string', message: error },
      select: { type: 'string', message: error },
      combobox: { type: 'string', message: error },
      jsonSchemaEditor: { type: 'string', message: error },
    },
  });

  function getCommonProps(name: string) {
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      name,
      control: form.control,
      placeholder: `${capitalizedName} placeholder`,
      label: `${capitalizedName} label`,
      isRequired: true,
    };
  }
  const divider = <hr style={{ borderColor: 'green' }} />;
  return (
    <Form {...form}>
      <form style={{ width: 320 }}>
        <GenericInput {...getCommonProps('input')} />
        {divider}
        <GenericTextarea {...getCommonProps('textarea')} />
        {divider}
        <GenericSelect {...getCommonProps('select')} options={[]} />
        {divider}
        <GenericComboBox {...getCommonProps('combobox')} options={[]} />
        {divider}
        <JsonSchemaInput {...getCommonProps('jsonSchemaEditor')} />
      </form>
    </Form>
  );
}

describe('Form', () => {
  test('should properly highlight error state', async () => {
    agentStore.setState({ jsonSchemaMode: true });
    const { container } = render(<TestForm />);

    await act(async () => {
      await expect(container).toMatchScreenshot();
    });
  }, 20_000);
});
