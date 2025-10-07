/// <reference types="cypress" />

describe('Validation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('for agent validate only prompt as required field', () => {
    // Click create graph button
    cy.contains('Create graph').click();

    // Wait for app to initialize
    cy.contains('Save').should('exist');

    // Trigger Cmd+S to save
    cy.get('body').type('{cmd+s}');

    // Check for validation errors
    cy.contains('Validation Errors (1)').should('exist');
    cy.contains('Agent Errors (1)').click();
    cy.contains('Agent is missing required field: Prompt').should('exist');
  });
});
