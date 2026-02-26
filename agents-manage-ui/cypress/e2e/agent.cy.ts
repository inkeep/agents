/// <reference types="cypress" />

describe('Agent', () => {
  describe('Unsaved changes dialog', () => {
    beforeEach(() => {
      cy.visit(
        '/default/projects/activities-planner/agents/activities-planner?nodeId=get-coordinates-agent'
      );
    });

    it('should show dialog when user closes browser tab', () => {
      cy.get('#id').clear();

      cy.window().then((win) => {
        const beforeUnloadEvent = new win.Event('beforeunload');
        win.dispatchEvent(beforeUnloadEvent);
      });
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
    });

    it('should navigates to the page when changes are discarded', () => {
      cy.get('#id').clear();
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Discard').click();
      cy.location('pathname').should('eq', '/default/projects');
    });

    it('should closes the dialog when saving changes and validation errors are present', () => {
      cy.get('#id').clear();
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
    });

    it('should navigates to the page when changes are saved', () => {
      cy.get('#description').type('TEST');
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
      cy.location('pathname').should('eq', '/default/projects');
    });
  });

  it.skip('should correctly handle dirty state', () => {
    cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
    // Disable json schema builder
    cy.contains('JSON').click();
    for (const selector of [
      '[name=name]',
      'textarea[name=description]',
      '[data-uri$="prompt.template"] textarea',
      '[name="stopWhen.transferCountIs"]',
      '[data-uri$="contextConfig.contextVariables.json"] textarea',
      '[data-uri$="contextConfig.headersSchema.json"] textarea',
    ]) {
      cy.get('[type=submit]').should('have.prop', 'disabled', true);
      cy.get(selector).type('0', { force: true });
      cy.get('[type=submit]').should('have.prop', 'disabled', false);
      cy.get(selector).type('{backspace}', { force: true });
    }
  });
});
