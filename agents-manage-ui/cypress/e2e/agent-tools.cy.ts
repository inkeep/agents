/// <reference types="cypress" />

import { generateId } from '../../src/lib/utils/id-utils';

function dragNode(selector: string, nodeType: string) {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType }));
  dataTransfer.effectAllowed = 'move';

  cy.get(selector).should('be.visible').trigger('dragstart', { dataTransfer, force: true });
  cy.get('.react-flow__node-agent', { timeout: 20_000 }).should('have.length.at.least', 1);

  // New nodes are created by ReactFlow's canvas-level onDrop handler, not by
  // dropping onto an existing node element. Drop into a known-empty region
  // instead of the pane center, which is already occupied on existing-agent
  // pages and can make the drop flaky.
  cy.get('.react-flow__pane').then(($pane) => {
    const rect = $pane[0].getBoundingClientRect();
    const clientX = Math.min(rect.left + 240, rect.right - 80);
    const clientY = Math.min(rect.top + 200, rect.bottom - 80);

    cy.wrap($pane)
      .trigger('dragenter', { dataTransfer, clientX, clientY, force: true })
      .trigger('dragover', { dataTransfer, clientX, clientY, force: true })
      .trigger('drop', { dataTransfer, clientX, clientY, force: true });
  });
}

function selectFunctionToolNode() {
  cy.get('.react-flow__node-function-tool', { timeout: 20_000 })
    .should('have.length.at.least', 1)
    .last()
    .click({ force: true });
  cy.get('#function-tool-name', { timeout: 20_000 }).should('exist');
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

    dragNode('[aria-label="Drag Function Tool node"]', 'function-tool');
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 2);
    selectFunctionToolNode();
    connectEdge('[data-handleid="target-function-tool"]');

    // Fill in required function tool fields before saving
    cy.get('#function-tool-name').type('test-tool', { delay: 0 });
    cy.get('#function-tool-description').type('test description', { delay: 0 });
    cy.typeInMonaco('code.jsx', 'function () {}');
    // Fill input schema with template
    cy.contains('Input Schema').parent().parent().contains('Template').click();

    saveAndAssert();
    cy.get('.react-flow__node-agent').click();
    cy.get('[name=id]').clear().type('TEST', { delay: 0 });
    saveAndAssert();

    function saveAndAssert() {
      cy.contains('Save changes').click();
      cy.contains('Agent saved', { timeout: 30_000 }).should('exist');
      cy.reload();
      cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 2);
    }
  });

  describe('Format', () => {
    it('JSON', () => {
      const uri = 'contextVariables.json';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      cy.typeInMonaco(uri, '{"foo":123}');
      cy.get(`[data-uri="file:///${uri}"]`).prev().contains('Format').click();
      cy.assertMonacoContent(uri, '{\n  "foo": 123\n}');
    });
    it('JavaScript', () => {
      const uri = 'code.jsx';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      dragNode('[aria-label="Drag Function Tool node"]', 'function-tool');
      cy.get('.react-flow__node-function-tool', { timeout: 20_000 }).should(
        'have.length.at.least',
        1
      );
      selectFunctionToolNode();
      cy.typeInMonaco(uri, 'function qux(){return"foo"}');
      cy.contains('Format').click();
      cy.assertMonacoContent(
        uri,
        `function qux() {
  return "foo";
}`
      );
    });

    it('Prompt', () => {
      const uri = 'agent-prompt.template';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      cy.typeInMonaco(uri, '#   hello   {{name}}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, '# hello {{name}}');
    });
  });
});
