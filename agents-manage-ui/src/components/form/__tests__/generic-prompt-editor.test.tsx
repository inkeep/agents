// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { GenericPromptEditor } from '../generic-prompt-editor';

// Fix EnvironmentTeardownError: Cannot load '../monaco.contribution.js' imported from ../monaco-editor/esm/vs/editor/editor.main.js after the environment was torn down. This is not a bug in Vitest
// Component triggers importMonaco() inside a `useEffect`, which performs dynamic import() of monaco-editor, shiki
vi.mock('@/features/agent/state/use-monaco-store', async () => {
  const actual = await vi.importActual('@/features/agent/state/use-monaco-store');
  return {
    ...actual,
    useMonacoActions: () => ({
      importMonaco: vi.fn(),
    }),
  };
});

describe('GenericPromptEditor', () => {
  afterEach(cleanup);
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
