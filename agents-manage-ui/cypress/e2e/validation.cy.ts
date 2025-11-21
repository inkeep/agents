/// <reference types="cypress" />

describe('Validation', () => {
  it('for sub agent validate only `prompt` as required field', () => {
    cy.visit('/default/projects/my-weather-project/agents/new?pane=agent');
    // Wait for app to initialize and click to save
    cy.get('.react-flow__node-agent').should('be.visible');
    cy.contains('Save').click();

    // Check for validation errors
    cy.contains('Validation Errors (2)').should('exist');
    cy.contains('Sub Agent Errors (1)').click();
    cy.contains('Sub Agent is missing required field: Prompt').should('exist');
    cy.contains('Agent Configuration Errors (1)').click();
    cy.contains('Agent Name is too short. Please provide a valid value').should('exist');
  });

  it('should not allow save invalid JSON', () => {
    cy.visit('/default/projects/my-weather-project/agents/weather-agent');
    cy.get('.react-flow__node').eq(1).click();
    cy.get('[data-panel-id=side-pane]').contains('Back').click();
    cy.get('.monaco-editor').should('be.visible');
    cy.typeInMonaco('contextVariables.json', 'foo bar');
    cy.contains('Save changes').click();
    cy.get('[data-sonner-toast]').should('be.visible');
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });

  it('should not allow save empty id', () => {
    cy.visit('/default/projects/my-weather-project/agents/weather-agent');
    cy.get('.react-flow__node').eq(1).click();
    cy.get('[name=id]').clear();

    cy.contains('Save changes').click();
    cy.get('[data-sonner-toast]').should('be.visible');
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });
});
