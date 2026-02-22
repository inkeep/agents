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
    cy.visit('/default/projects/activities-planner');
    cy.contains('Create agent').click();
    cy.get('[name=name]').type(generateId(), { delay: 0 });
    cy.get('button[type=submit]').click();
    cy.url({ timeout: 30_000 }).should('include', '/agents/');
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 1);

    dragNode('[aria-label="Drag Function Tool node"]');
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 2);
    connectEdge('[data-handleid="target-function-tool"]');
    cy.typeInMonaco('code.jsx', 'function () {}');
    dragNode('[aria-label="Drag MCP node"]');
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 3);
    cy.contains('Weather').click();
    connectEdge('[data-handleid="target-mcp"]');
    saveAndAssert();
    cy.get('.react-flow__node-agent').click();
    cy.get('[name=id]').clear().type('TEST', { delay: 0 });
    saveAndAssert();

    function saveAndAssert() {
      cy.intercept('POST', '**/agents/*').as('saveAgent');
      cy.contains('Save changes').click();
      cy.wait('@saveAgent').then((interception) => {
        const status = interception.response?.statusCode;
        const body = interception.response?.body;
        cy.log(`Save response status: ${status}`);
        cy.log(`Save response body: ${JSON.stringify(body).substring(0, 2000)}`);
        if (status && status >= 400) {
          cy.log(`SAVE FAILED with status ${status}`);
        }
      });
      cy.contains('Agent saved', { timeout: 20_000 }).should('exist');
      cy.reload();
      cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 3);
    }
  });

  describe('Format', () => {
    it('JSON', () => {
      const uri = 'contextVariables.json';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      cy.typeInMonaco(uri, '{"foo":123}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, '{\n  "foo": 123\n}');
    });
    it('JavaScript', () => {
      const uri = 'code.jsx';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      dragNode('[aria-label="Drag Function Tool node"]');
      cy.typeInMonaco(uri, 'function(){return"foo"}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, 'function() { return "foo" }');
    });
  });
});
