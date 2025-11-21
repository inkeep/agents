/// <reference types="cypress" />

describe('Validation', () => {
  it('for sub agent validate only `prompt` as required field', () => {
    // Navigate to agents page and create a new agent
    cy.visit('/default/projects/my-weather-project/agents');
    // Click the "Create agent" card to open the dialog
    cy.contains('Create agent').first().click();

    // Wait for dialog to open and fill in the form
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[name="name"]').type('Test Agent');
    cy.get('[name="id"]').type('test-agent');

    // Submit to create the agent (button with type="submit" in the form)
    cy.get('[role="dialog"]').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Wait for redirect to the agent editor page
    cy.url().should('include', '/agents/test-agent');

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
    cy.window().then((win) => {
      const models = (win.monaco as typeof import('monaco-editor')).editor.getModels();
      const jsonModel = models.find((model) => model.uri.path.endsWith('.json'));
      expect(jsonModel, 'JSON Monaco model').to.exist;

      jsonModel.setValue('foo bar');
    });

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
