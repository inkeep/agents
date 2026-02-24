/// <reference types="cypress" />

import { generateId } from '../../src/lib/utils/id-utils';

function dragNode(selector: string) {
  const dataTransfer = new DataTransfer();
  cy.get(selector).trigger('dragstart', { dataTransfer });

  cy.get('.react-flow__node-agent')
    .eq(0)
    .trigger('dragover', { dataTransfer })
    .trigger('drop', { dataTransfer });
}
function connectEdge(selector: string) {
  // React flow doesn't use onDragStart
  cy.get(selector).trigger('mousedown', { button: 0 });
  cy.get('[data-handleid="target-agent"]').trigger('mousemove').trigger('mouseup', { force: true });
}

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

  it('Editing sub-agent ID should not removes linked tools', () => {
    cy.visit('/default/projects/my-weather-project');
    cy.contains('Create agent').click();
    cy.get('[name=name]').type(generateId(), { delay: 0 });
    cy.get('button[type=submit]').click();
    cy.get('.react-flow__node').should('exist');

    dragNode('[aria-label="Drag Function Tool node"]');
    connectEdge('[data-handleid="target-function-tool"]');
    cy.typeInMonaco('code.jsx', 'function () {}');
    dragNode('[aria-label="Drag MCP node"]');
    cy.contains('Geocode address').click();
    connectEdge('[data-handleid="target-mcp"]');
    saveAndAssert();
    cy.get('.react-flow__node-agent').click();
    cy.get('[name=id]').clear().type('TEST', { delay: 0 });
    saveAndAssert();

    function saveAndAssert() {
      cy.contains('Save changes').click();
      cy.contains('Agent saved').should('exist');
      cy.reload();
      cy.get('.react-flow__node').should('have.length', 3);
    }
  });

  describe('Format', () => {
    it('JSON', () => {
      const uri = 'contextConfig.contextVariables.json';

      cy.visit('/default/projects/my-weather-project/agents/weather-agent?pane=agent');
      cy.typeInMonaco(uri, '{"foo":123}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, '{\n  "foo": 123\n}');
    });
    it('JavaScript', () => {
      const uri = 'code.jsx';

      cy.visit('/default/projects/my-weather-project/agents/weather-agent?pane=agent');
      dragNode('[aria-label="Drag Function Tool node"]');
      cy.typeInMonaco(uri, 'function(){return"foo"}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, 'function() { return "foo" }');
    });
  });
});
