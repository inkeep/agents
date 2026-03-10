/// <reference types="cypress" />

describe('Agent', () => {
  describe('Unsaved changes dialog', () => {
    beforeEach(() => {
      cy.visit(
        '/default/projects/activities-planner/agents/activities-planner?nodeId=get-coordinates-agent'
      );
    });

    it('should show dialog when user closes browser tab', () => {
      cy.get('label').contains('Id').next().clear();

      cy.window().then((win) => {
        const beforeUnloadEvent = new win.Event('beforeunload');
        win.dispatchEvent(beforeUnloadEvent);
      });
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
    });

    it('should navigates to the page when changes are discarded', () => {
      cy.get('label').contains('Id').next().clear();
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Discard').click();
      cy.location('pathname').should('eq', '/default/projects');
    });

    it('should closes the dialog when saving changes and validation errors are present', () => {
      cy.get('label').contains('Id').next().clear();
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
    });

    it('should navigates to the page when changes are saved', () => {
      cy.get('label').contains('Description').next().clear();
      cy.contains('Projects').click();
      cy.get('[role=dialog]').contains('Save changes').click();
      cy.get('[role=dialog]').should('not.exist');
      cy.location('pathname').should('eq', '/default/projects');
    });
  });

  describe('should correctly handle dirty state', () => {
    function typeAndUndo(selector: string) {
      cy.get(selector).type('0', { force: true });
      cy.get('[type=submit]').should('have.prop', 'disabled', false);
      cy.get(selector).type('{backspace}', { force: true });
      cy.get('[type=submit]').should('have.prop', 'disabled', true);
    }
    it('agent settings', () => {
      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent', {
        onBeforeLoad(win) {
          win.localStorage.setItem(
            'inkeep:agent',
            // Disable json schema builder
            JSON.stringify({ state: { jsonSchemaMode: true }, version: 0 })
          );
        },
      });
      for (const selector of [
        '[name=name]',
        'textarea[name=description]',
        '[data-uri$="prompt.template"] textarea',
        '[name="stopWhen.transferCountIs"]',
        '[data-uri$="contextConfig.contextVariables.json"] textarea',
        '[data-uri$="contextConfig.headersSchema.json"] textarea',
      ]) {
        typeAndUndo(selector);
      }
    });
    it('sub agent', () => {
      cy.visit(
        '/default/projects/activities-planner/agents/activities-planner?pane=node&nodeId=get-coordinates-agent'
      );
      for (const selector of [
        '[name$=".name"]',
        '[name$=".id"]',
        'textarea[name$=".description"]',
        '[data-uri$=".prompt.template"] textarea',
        '[name$=".stopWhen.stepCountIs"]',
      ]) {
        typeAndUndo(selector);
      }
    });
  });
});
