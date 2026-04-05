// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDerivedProp } from '../use-derived-prop';

const HookHarness: FC<{ value: string }> = ({ value }) => {
  const [derivedValue, setDerivedValue] = useDerivedProp(value);

  return (
    <>
      <div data-testid="derived-value">{derivedValue}</div>
      <button type="button" onClick={() => setDerivedValue('local draft')}>
        Set local draft
      </button>
    </>
  );
};

describe('useDerivedProp', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the prop value on initial render', () => {
    render(<HookHarness value="server value" />);

    expect(screen.getByTestId('derived-value')).toHaveTextContent('server value');
  });

  it('preserves a local draft while the prop value is unchanged', () => {
    render(<HookHarness value="server value" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set local draft' }));

    expect(screen.getByTestId('derived-value')).toHaveTextContent('local draft');
  });

  it('resets back to the prop value when the prop changes', () => {
    const { rerender } = render(<HookHarness value="server value" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set local draft' }));
    expect(screen.getByTestId('derived-value')).toHaveTextContent('local draft');

    rerender(<HookHarness value="updated server value" />);

    expect(screen.getByTestId('derived-value')).toHaveTextContent('updated server value');
  });
});
