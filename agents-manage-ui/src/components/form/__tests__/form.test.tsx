import { render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericComboBox } from '../generic-combo-box';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { GenericSelect } from '@/components/form/generic-select';
import '@/app/globals.css';

function TestForm() {
  const form = useForm({
    errors: {
      input: { type: 'string', message: 'YOUR_ERROR' },
      textarea: { type: 'string', message: 'YOUR_ERROR' },
      select: { type: 'string', message: 'YOUR_ERROR' },
      combobox: { type: 'string', message: 'YOUR_ERROR' },
    },
  });

  return (
    <Form {...form}>
      <form>
        <GenericInput control={form.control} name="input" label="Input" />
        <GenericTextarea control={form.control} name="textarea" label="Textarea" />
        <GenericSelect control={form.control} name="select" label="Select" options={[]} />
        <GenericComboBox control={form.control} name="combobox" label="Combobox" options={[]} />
      </form>
    </Form>
  );
}

describe('Form', () => {
  it('should properly highlight error state', async () => {
    const { container } = render(<TestForm />);
    await expect.element(container).toMatchScreenshot('form-error-state');
  }, 1000);
});
