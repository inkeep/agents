import '@testing-library/jest-dom';

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
