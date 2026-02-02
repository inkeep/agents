import { render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericComboBox } from '../generic-combo-box';

function TestForm() {
  const form = useForm({
    defaultValues: {
      owner: '',
    },
    errors: {
      owner: {
        type: 'string',
        message: 'Owner is required.',
      },
    },
  });

  return (
    <Form {...form}>
      <form>
        <GenericComboBox
          control={form.control}
          name="owner"
          label="Owner"
          placeholder="Select owner"
          options={[
            { value: 'alice', label: 'Alice' },
            { value: 'bob', label: 'Bob' },
          ]}
        />
      </form>
    </Form>
  );
}

describe('GenericComboBox', () => {
  it('matches snapshot when error occurs', async () => {
    const { container } = render(<TestForm />);
    await expect.element(container).toMatchScreenshot('generic-combo-box');
  }, 1000);
});
