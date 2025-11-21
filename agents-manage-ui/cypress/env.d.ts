declare namespace globalThis {
  import type * as Monaco from 'monaco-editor';
  // For cypress
  var monaco: Monaco;
}

declare namespace globalThis {
  namespace Cypress {
    interface Chainable {
      typeInMonaco(uri: string, value: string): Chainable<JQuery>;
    }
  }
}
