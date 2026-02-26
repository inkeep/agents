/// <reference types="cypress" />

describe('Validation', () => {
  it('should not allow save invalid JSON', () => {
    cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
    cy.typeInMonaco('contextConfig.contextVariables.json', 'foo bar');
    cy.contains('Save changes').click();
    cy.get('[data-sonner-toast][data-type=error]').should('be.visible');
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });

  it('should not allow save empty id', () => {
    cy.visit(
      '/default/projects/activities-planner/agents/activities-planner?pane=node&nodeId=activities-planner'
    );
    cy.get('[name=id]').clear();
    cy.contains('Save changes').click();
    cy.get('[data-sonner-toast][data-type=error]').should('be.visible');
    cy.contains('Save changes').should('not.be.disabled');
    cy.contains('Agent saved', { timeout: 0 }).should('not.exist');
  });
});
