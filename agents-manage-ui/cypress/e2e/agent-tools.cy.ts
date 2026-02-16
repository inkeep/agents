/// <reference types="cypress" />

import { generateId } from '../../src/lib/utils/id-utils';

function dragNode(selector: string) {
  const dataTransfer = new DataTransfer();
  cy.get(selector).trigger('dragstart', { dataTransfer, force: true });

  cy.get('.react-flow__node-agent')
    .eq(0)
    .trigger('dragover', { dataTransfer, force: true })
    .trigger('drop', { dataTransfer, force: true });
}
function connectEdge(selector: string) {
  cy.get(selector).trigger('mousedown', { button: 0, force: true });
  cy.get('[data-handleid="target-agent"]')
    .trigger('mousemove', { force: true })
    .trigger('mouseup', { force: true });
}

describe('Agent Tools', () => {
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
      const uri = 'contextVariables.json';

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
