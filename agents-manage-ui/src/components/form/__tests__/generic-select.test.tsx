import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericSelect } from '../generic-select';

type FormValues = {
  status: string;
};

const errorMessage = 'Status is required.';

function TestForm() {
  const form = useForm<FormValues>({
    defaultValues: {
      status: '',
    },
  });

  useEffect(() => {
    form.setError('status', { type: 'manual', message: errorMessage });
  }, [form]);

  return (
    <Form {...form}>
      <form>
        <GenericSelect
          control={form.control}
          name="status"
          label="Status"
          placeholder="Select status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </form>
    </Form>
  );
}

describe('GenericSelect', () => {
  it.skip('matches snapshot when error occurs', async () => {
    const { asFragment } = render(<TestForm />);

    await screen.findByText(errorMessage);

    expect(asFragment()).toMatchSnapshot();
  });
});
