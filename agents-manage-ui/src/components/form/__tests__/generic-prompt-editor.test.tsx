// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { GenericPromptEditor } from '../generic-prompt-editor';
import { useForm } from 'react-hook-form';
import type { FC } from 'react';
import { Form } from '@/components/ui/form';

describe('GenericPromptEditor', () => {
  test('should show Add variables button for .template files (default)', () => {
    const Test: FC = () => {
      const form = useForm();
      return (
        <Form {...form}>
          <GenericPromptEditor control={form.control} placeholder="" name="test" label="Test" />
        </Form>
      );
    };
    render(<Test />);
    expect(screen.getByText('Add variables')).toBeInTheDocument();
  });

  test('should hide Add variables button for .md files', () => {
    const Test: FC = () => {
      const form = useForm();
      return (
        <Form {...form}>
          <GenericPromptEditor
            control={form.control}
            placeholder=""
            name="test"
            label="Test"
            uri="test.md"
          />
        </Form>
      );
    };
    render(<Test />);
    expect(screen.queryByText('Add variables')).not.toBeInTheDocument();
  });
});
