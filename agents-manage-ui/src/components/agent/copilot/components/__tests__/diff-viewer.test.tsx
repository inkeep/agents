// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { DiffField } from '../diff-viewer';

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

describe('DiffField', () => {
  afterEach(cleanup);
  it('renders field label from field name', () => {
    render(
      <DiffField
        field="executeCode"
        originalValue=""
        newValue="async function execute() { return 1; }"
        renderAsCode
      />
    );
    expect(screen.getByText('Execute code')).toBeInTheDocument();
  });

  it('uses text diff when renderAsCode is false for string values', () => {
    render(
      <DiffField
        field="description"
        originalValue="Old description"
        newValue="New description"
        renderAsCode={false}
      />
    );
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
