/**
 * Fixes TypeError: Cannot read properties of null (reading 'webkitBackingStorePixelRatio')
 */
import 'vitest-canvas-mock';
/**
 * Fixes TypeError: Cannot read properties of undefined (reading 'escape')
 */
import '@testing-library/jest-dom/vitest';
/**
 * Fixes TypeError: mainWindow.matchMedia is not a function
 * @see https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: false,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

export * from 'monaco-editor';
