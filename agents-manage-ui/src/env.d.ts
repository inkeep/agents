declare namespace globalThis {
  import type * as Monaco from 'monaco-editor';
  var MonacoEnvironment: Monaco.Environment;
}

declare module '*.svg?svgr' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGElement>>;

  export default ReactComponent;
}

import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}
