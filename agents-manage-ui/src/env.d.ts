declare namespace globalThis {
  import type * as Monaco from 'monaco-editor';
  var MonacoEnvironment: Monaco.Environment;
  // For cypress
  var monaco: Monaco;
}

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGElement>>;

  export default ReactComponent;
}
