import { render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Form } from '@/components/ui/form';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { GenericComboBox } from '../generic-combo-box';
import '@/app/globals.css';

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

  const commonProps = {
    control: form.control,
    placeholder: 'Component placeholder',
    label: 'Component label',
  };
  const divider = <hr style={{ borderColor: 'green' }} />;
  return (
    <Form {...form}>
      <form>
        {divider}
        <GenericInput {...commonProps} name="input" />
        {divider}
        <GenericTextarea {...commonProps} name="textarea" />
        {divider}
        <GenericSelect {...commonProps} name="select" options={[]} />
        {divider}
        <GenericComboBox {...commonProps} name="combobox" options={[]} />
        {divider}
        <JsonSchemaInput {...commonProps} name="jsonSchemaEditor" />
        {divider}
      </form>
    </Form>
  );
}

describe('Form', () => {
  it('should properly highlight error state', () => {
    agentStore.setState({ jsonSchemaMode: true });
    const { container } = render(<TestForm />);

    expect(container).toMatchScreenshot('form-error-state');
  }, 100);
});
