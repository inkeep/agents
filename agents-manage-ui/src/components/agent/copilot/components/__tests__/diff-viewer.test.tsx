// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiffField } from '../diff-viewer';

describe('DiffField', () => {
  it('renders field label from field name', () => {
    render(
      <DiffField
        field="executeCode"
        originalValue=""
        newValue="async function execute() { return 1; }"
        renderAsCode={true}
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
