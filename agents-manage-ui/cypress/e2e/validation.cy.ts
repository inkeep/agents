/// <reference types="cypress" />

describe('Validation', () => {
  it('should not allow save invalid JSON', () => {
    cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
    cy.typeInMonaco('contextConfig.contextVariables.json', 'foo bar');
    cy.contains('Save changes').click();
    cy.contains('.react-flow__panel', 'Validation Errors (1)').within(() => {
      cy.contains('contextConfig: Invalid JSON syntax → at "contextVariables"');
    });
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });

  it('should not allow save empty id', () => {
    cy.visit(
      '/default/projects/activities-planner/agents/activities-planner?pane=node&nodeId=activities-planner'
    );
    cy.get('label').contains('Id').next().clear();
    cy.contains('Save changes').click();
    cy.contains('.react-flow__panel', 'Validation Errors (1)').within(() => {
      cy.contains('id: Id is required');
    });
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });
});
