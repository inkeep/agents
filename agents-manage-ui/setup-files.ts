import * as extensions from '@testing-library/jest-dom/matchers';

beforeAll(() => {
  if (typeof document !== 'undefined') {
    expect.extend(extensions);
  }
});
/**
 * Fixes TypeError: document.queryCommandSupported is not a function
 */
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    writable: false,
    value: {
      write: async () => null,
    },
  });
}

// to make it works like Jest (auto-mocking)
vi.mock('monaco-editor');
