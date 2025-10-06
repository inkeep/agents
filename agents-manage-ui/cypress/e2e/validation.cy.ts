/// <reference types="cypress" />

describe('Validation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('validate only prompt for agent', () => {
    // Click create graph button
    cy.contains('Create graph').click();

    // Wait for app to initialize
    cy.contains('Save').should('exist');

    // Trigger Cmd+S to save
    cy.get('body').type('{cmd+s}');

    // Wait for save action
    cy.wait(2000);

    // Check for validation errors
    cy.contains('Validation Errors (2)').should('exist');

    cy.contains('Agent Errors (2)').click();
    cy.contains('Agent is missing required field: Prompt').should('exist');
  });
});
