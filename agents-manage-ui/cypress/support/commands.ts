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
    }
  }
}

Cypress.Commands.add('deleteAgent', (tenantId: string, projectId: string, agentId: string) => {
  const managementApiUrl = Cypress.env('MANAGEMENT_API_URL') || 'http://localhost:3002';

  cy.request({
    method: 'DELETE',
    url: `${managementApiUrl}/tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    failOnStatusCode: false,
  }).then((response) => {
    cy.log(`Delete agent ${agentId}: ${response.status}`);
  });
});

export {};
