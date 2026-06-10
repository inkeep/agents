import { cleanup, render, screen } from '@testing-library/react';
import { CacheStateBadge } from '@/components/traces/timeline/cache-state-badge';
import '@/lib/utils/test-utils/styles.css';

describe('CacheStateBadge', () => {
  afterEach(cleanup);

  test('HIT renders success variant with HIT label and cache hit aria-label', () => {
    render(<CacheStateBadge state="HIT" />);
    const badge = screen.getByLabelText(/Cache hit/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('HIT');
    expect(badge).toHaveAttribute('data-cache-state', 'HIT');
    const svg = badge.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  test('MISS renders a neutral warning variant with MISS label (never "regression")', () => {
    render(<CacheStateBadge state="MISS" />);
    const badge = screen.getByLabelText(/Cache miss/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('MISS');
    expect(badge).toHaveAttribute('data-cache-state', 'MISS');
    // The alarming "possible regression" framing must not come back.
    expect(badge.getAttribute('aria-label')).not.toMatch(/regression/i);
  });

  test('NOT-ATTEMPTED renders code variant with Skipped label and not-attempted aria-label', () => {
    render(<CacheStateBadge state="NOT-ATTEMPTED" />);
    const badge = screen.getByLabelText(/Cache not attempted/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Skipped');
    expect(badge).toHaveAttribute('data-cache-state', 'NOT-ATTEMPTED');
  });

  test('NOT-SUPPORTED-BY-PROVIDER renders code variant with N/A label and provider aria-label', () => {
    render(<CacheStateBadge state="NOT-SUPPORTED-BY-PROVIDER" />);
    const badge = screen.getByLabelText(/Cache not supported by provider/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('N/A');
    expect(badge).toHaveAttribute('data-cache-state', 'NOT-SUPPORTED-BY-PROVIDER');
  });

  test('undefined state defaults to NOT-ATTEMPTED for legacy spans', () => {
    render(<CacheStateBadge state={undefined} />);
    const badge = screen.getByLabelText(/Cache not attempted/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Skipped');
    expect(badge).toHaveAttribute('data-cache-state', 'NOT-ATTEMPTED');
  });

  test('NOT-ATTEMPTED and NOT-SUPPORTED-BY-PROVIDER share the same code variant but render distinct labels', () => {
    const { unmount } = render(<CacheStateBadge state="NOT-ATTEMPTED" />);
    const notAttemptedBadge = screen.getByLabelText(/Cache not attempted/i);
    const notAttemptedClass = notAttemptedBadge.className;
    const notAttemptedLabel = notAttemptedBadge.textContent;
    unmount();

    render(<CacheStateBadge state="NOT-SUPPORTED-BY-PROVIDER" />);
    const notSupportedBadge = screen.getByLabelText(/Cache not supported by provider/i);
    const notSupportedClass = notSupportedBadge.className;
    const notSupportedLabel = notSupportedBadge.textContent;

    expect(notAttemptedClass).toBe(notSupportedClass);
    expect(notAttemptedLabel).not.toBe(notSupportedLabel);
  });

  test('badge is keyboard focusable for screen-reader and keyboard users', () => {
    render(<CacheStateBadge state="HIT" />);
    const badge = screen.getByLabelText(/Cache hit/i);
    expect(badge).toHaveAttribute('tabindex', '0');
  });

  test('surfaces read/write token counts in the aria-label when provided (slash-separated)', () => {
    render(<CacheStateBadge state="HIT" readTokens={15927} writeTokens={3324} />);
    const badge = screen.getByLabelText(/15,927 read \/ 3,324 write/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-cache-state', 'HIT');
    // base description is preserved alongside the counts
    expect(badge.getAttribute('aria-label')).toMatch(/served from provider cache/i);
  });

  test('defaults a missing read or write side to 0 rather than omitting it', () => {
    render(<CacheStateBadge state="MISS" writeTokens={15927} />);
    const badge = screen.getByLabelText(/0 read \/ 15,927 write/i);
    expect(badge).toBeInTheDocument();
  });

  test('omits the count clause entirely when neither token prop is provided', () => {
    render(<CacheStateBadge state="HIT" />);
    const badge = screen.getByLabelText(/Cache hit/i);
    expect(badge.getAttribute('aria-label')).not.toMatch(/read \/|write/i);
  });

  test('each state includes both icon (svg) and text — three a11y channels (icon + text + variant), not color-only', () => {
    const states = ['HIT', 'MISS', 'NOT-ATTEMPTED', 'NOT-SUPPORTED-BY-PROVIDER'] as const;

    for (const state of states) {
      const { unmount } = render(<CacheStateBadge state={state} />);
      const badge = screen.getByLabelText(/Cache/i);
      const svg = badge.querySelector('svg');
      expect(svg, `state=${state} must include an icon`).toBeInTheDocument();
      expect(badge.textContent, `state=${state} must include a non-empty text label`).toBeTruthy();
      unmount();
    }
  });
});
