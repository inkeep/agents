/**
 * Setup Monaco Editor workers for Webpack/Turbopack projects like Next.js.
 */
globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    console.info('setup-workers/webpack', { label });
    if (label === 'json') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url)
      );
    }
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url)
      );
    }
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url));
  },
};
