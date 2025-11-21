// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

import './commands';

Cypress.on('uncaught:exception', (err) => {
  // returning false prevents Cypress from failing the test
  if (
    // Promise from monaco-editor
    err.message.includes('  > Canceled') ||
    err.message.includes('  > ResizeObserver loop completed with undelivered notifications.')
  ) {
    return false;
  }
  console.error('Cypress uncaught exception', [err.message]);
});
