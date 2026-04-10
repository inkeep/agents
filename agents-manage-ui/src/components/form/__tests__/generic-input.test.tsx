// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { GenericInput } from '../generic-input';

describe('GenericInput', () => {
  afterEach(cleanup);

  test('transforms text input values before storing them', () => {
    const Test: FC = () => {
      const form = useForm({
        defaultValues: {
          name: '',
        },
      });

      return (
        <Form {...form}>
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            transformValue={(value) => value.replaceAll(' ', '-')}
          />
        </Form>
      );
    };

    render(<Test />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, {
      target: { value: 'my skill name' },
    });

    expect(input).toHaveValue('my-skill-name');
  });
});
