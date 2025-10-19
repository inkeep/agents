declare namespace globalThis {
  import type * as monaco from 'monaco-editor';
  var MonacoEnvironment: monaco.Environment;
}

declare module 'monaco-editor/esm/vs/editor/common/core/range.js' {
  export { Range } from 'monaco-graphql/esm/monaco-editor';
}
