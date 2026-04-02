// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { DiffField } from '../diff-viewer';

describe('DiffField', () => {
  afterEach(cleanup);
  it('renders field label from field name', async () => {
    render(
      <DiffField
        field="executeCode"
        originalValue=""
        newValue="async function execute() { return 1; }"
        renderAsCode
      />
    );
    await vi.dynamicImportSettled();
    expect(screen.getByText('Execute code')).toBeInTheDocument();
  }, 10_000);

  it('uses text diff when renderAsCode is false for string values', async () => {
    render(
      <DiffField
        field="description"
        originalValue="Old description"
        newValue="New description"
        renderAsCode={false}
      />
    );
    await vi.dynamicImportSettled();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
