// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ExpandablePromptEditor } from '../expandable-prompt-editor';

describe('ExpandablePromptEditor', () => {
  it('should show Add variables button for .template files (default)', () => {
    render(<ExpandablePromptEditor name="test" label="Test" />);
    expect(screen.getByText('Add variables')).toBeInTheDocument();
  });

  it('should hide Add variables button for .md files', () => {
    render(<ExpandablePromptEditor name="test" label="Test" uri="test.md" />);
    expect(screen.queryByText('Add variables')).not.toBeInTheDocument();
  });
});
