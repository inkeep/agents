import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericComboBox } from '../generic-combo-box';

type FormValues = {
  owner: string;
};

const errorMessage = 'Owner is required.';

function TestForm() {
  const form = useForm<FormValues>({
    defaultValues: {
      owner: '',
    },
  });

  useEffect(() => {
    form.setError('owner', { type: 'manual', message: errorMessage });
  }, [form]);

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
    const { asFragment } = render(<TestForm />);

    await screen.findByText(errorMessage);

    expect(asFragment()).toMatchSnapshot();
  });
});
