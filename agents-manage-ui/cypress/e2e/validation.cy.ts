/// <reference types="cypress" />

describe('Validation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('for sub agent validate only `prompt` as required field', () => {
    // Click create graph button
    cy.contains('Create agent').click();

    // Wait for app to initialize and click to save
    cy.contains('Agent Settings').should('be.visible');
    cy.contains('Save').click();

    // Check for validation errors
    cy.contains('Validation Errors (1)').should('exist');
    cy.contains('Sub Agent Errors (1)').click();
    cy.contains('Sub Agent is missing required field: Prompt').should('exist');
  });
});
