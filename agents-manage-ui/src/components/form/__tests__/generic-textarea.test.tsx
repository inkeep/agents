import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@/components/ui/form';
import { GenericTextarea } from '../generic-textarea';

type FormValues = {
  notes: string;
};

const errorMessage = 'Notes are required.';

function TestForm() {
  const form = useForm<FormValues>({
    defaultValues: {
      notes: '',
    },
  });

  useEffect(() => {
    form.setError('notes', { type: 'manual', message: errorMessage });
  }, [form]);

  return (
    <Form {...form}>
      <form>
        <GenericTextarea control={form.control} name="notes" label="Notes" placeholder="Notes" />
      </form>
    </Form>
  );
}

describe('GenericTextarea', () => {
  it('matches snapshot when error occurs', async () => {
    const { asFragment } = render(<TestForm />);

    await screen.findByText(errorMessage);

    expect(asFragment()).toMatchSnapshot();
  });
});
