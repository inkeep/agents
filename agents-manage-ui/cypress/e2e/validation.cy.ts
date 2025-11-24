/// <reference types="cypress" />

describe('Validation', () => {
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
