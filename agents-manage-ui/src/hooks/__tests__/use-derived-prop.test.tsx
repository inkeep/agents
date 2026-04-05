// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { useDerivedProp } from '../use-derived-prop';

const serverValue = 'server value';
const localValue = 'local draft';

const HookHarness: FC<{ value: string }> = ({ value }) => {
  const [derivedValue, setDerivedValue] = useDerivedProp(value);

  return (
    <button type="button" onClick={() => setDerivedValue(localValue)}>
      {derivedValue}
    </button>
  );
};

describe('useDerivedProp', () => {
  it('returns the prop value on initial render', () => {
    render(<HookHarness value={serverValue} />);

    expect(screen.getByRole('button')).toHaveTextContent(serverValue);
  });

  it('preserves a local draft while the prop value is unchanged', () => {
    render(<HookHarness value={serverValue} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent(localValue);
  });

  it('resets back to the prop value when the prop changes', () => {
    const { rerender } = render(<HookHarness value={serverValue} />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent(localValue);

    rerender(<HookHarness value="updated server value" />);

    expect(screen.getByRole('button')).toHaveTextContent('updated server value');
  });
});
