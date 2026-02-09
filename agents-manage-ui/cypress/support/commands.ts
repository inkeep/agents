// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

declare global {
  namespace Cypress {
    interface Chainable {
      deleteAgent(tenantId: string, projectId: string, agentId: string): Chainable<void>;
      login(email?: string, password?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('login', (email?: string, password?: string) => {
  const defaultEmail = Cypress.env('TEST_USER_EMAIL');
  const defaultPassword = Cypress.env('TEST_USER_PASSWORD');

  const loginEmail = email || defaultEmail;
  const loginPassword = password || defaultPassword;

  // Use cy.session to cache authentication across tests
  cy.session(
    [loginEmail, loginPassword],
    () => {
      cy.log(`🔐 Performing login for ${loginEmail}`);
      cy.visit('/login');
      cy.get('#email', { timeout: 10000 }).should('be.visible').type(loginEmail, { delay: 0 });
      cy.get('#password').should('be.visible').type(loginPassword, { delay: 0 });
      cy.get('button[type="submit"]').contains('Sign in').click();

      // Wait for redirect after successful login to a projects page
      cy.url({ timeout: 15000 }).should('match', /\/default\/projects/);

      // Wait for the page to fully load by checking for a stable element
      cy.get('body', { timeout: 10000 }).should('be.visible');

      // Add a small delay to ensure cookies and session are fully set
      cy.wait(500);

      cy.log('✅ Login successful - session established and cached');
    },
    {
      validate() {
        // Validate session is still active before reusing it
        // Use a simple check - try to visit a protected page
        cy.log('🔍 Validating cached session...');
        cy.request({ url: '/default/projects', failOnStatusCode: false }).then((response) => {
          // If we get redirected to login (or 401/403), session is invalid
          if (
            response.status === 401 ||
            response.status === 403 ||
            response.body?.includes('Sign in')
          ) {
            cy.log('❌ Session validation failed - will re-login');
            throw new Error('Session expired');
          }
          cy.log('✅ Session validation passed - reusing cached session');
        });
      },
    }
  );
});

Cypress.Commands.add('deleteAgent', (tenantId: string, projectId: string, agentId: string) => {
  const managementApiUrl = Cypress.env('MANAGEMENT_API_URL') || 'http://localhost:3002';

  cy.request({
    method: 'DELETE',
    url: `${managementApiUrl}/manage/tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    failOnStatusCode: false,
  }).then((response) => {
    cy.log(`Delete agent ${agentId}: ${response.status}`);
  });
});

Cypress.Commands.add('typeInMonaco', (uri: string, value: string) => {
  return cy
    .get(`[data-uri="file:///${uri}"] textarea`)
    .type('{selectall}{del}', { force: true })
    .type(value, {
      parseSpecialCharSequences: false,
      delay: 0,
      force: true,
    });
});

Cypress.Commands.add(
  'assertMonacoContent',
  ($uri: string, expected: string | ((content: string) => void)) => {
    cy.window().should('have.property', 'monaco');
    cy.window().should((win) => {
      const { Uri, editor } = win.monaco;
      const uri = Uri.file($uri);
      const model = editor.getModel(uri);

      const value = model.getValue();

      if (typeof expected === 'function') {
        expected(value);
        return;
      }
      expect(value).to.eq(expected);
    });
  }
);

export {};
