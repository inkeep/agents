// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { GenericPromptEditor } from '../generic-prompt-editor';

describe('GenericPromptEditor', () => {
  afterEach(cleanup);
  test('should show Add variables button for .template files (default)', async () => {
    const Test: FC = () => {
      const form = useForm();
      return (
        <Form {...form}>
          <GenericPromptEditor control={form.control} placeholder="" name="test" label="Test" />
        </Form>
      );
    };
    render(<Test />);
    await vi.dynamicImportSettled();
    expect(screen.getByText('Add variables')).toBeInTheDocument();
  });

  test('should hide Add variables button for .md files', async () => {
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
    await vi.dynamicImportSettled();
    expect(screen.queryByText('Add variables')).not.toBeInTheDocument();
  });
});
