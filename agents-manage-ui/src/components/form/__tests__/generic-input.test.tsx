import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericInput } from '../generic-input';

type FormValues = {
  name: string;
};

const errorMessage = 'Name is required.';

function TestForm() {
  const form = useForm<FormValues>({
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    form.setError('name', { type: 'manual', message: errorMessage });
  }, [form]);

  return (
    <Form {...form}>
      <form>
        <GenericInput control={form.control} name="name" label="Name" placeholder="Name" />
      </form>
    </Form>
  );
}

describe('GenericInput', () => {
  it('matches snapshot when error occurs', async () => {
    const { asFragment } = render(<TestForm />);

    await screen.findByText(errorMessage);

    expect(asFragment()).toMatchSnapshot();
  });
});
