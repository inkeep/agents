/// <reference types="cypress" />

import { generateId } from '../../src/lib/utils/id-utils';

function dragNode(selector: string) {
  const dataTransfer = new DataTransfer();

  cy.get(selector)
    .invoke('attr', 'data-node-type')
    .then((nodeType) => {
      if (nodeType) {
        dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType }));
      }
      dataTransfer.effectAllowed = 'move';

      cy.get(selector).should('be.visible').trigger('dragstart', { dataTransfer, force: true });

      // New nodes are created by ReactFlow's canvas-level onDrop handler on the pane,
      // not by dropping onto an existing node element. Drop into a known-empty region
      // of the pane instead of the pane center, which can already be occupied and flaky.
      cy.get('.react-flow__pane').then(($pane) => {
        const rect = $pane[0].getBoundingClientRect();
        const clientX = Math.min(rect.left + 240, rect.right - 80);
        const clientY = Math.min(rect.top + 200, rect.bottom - 80);

        cy.wrap($pane)
          .trigger('dragenter', { dataTransfer, clientX, clientY, force: true })
          .trigger('dragover', { dataTransfer, clientX, clientY, force: true })
          .trigger('drop', { dataTransfer, clientX, clientY, force: true });
      });
    });
}
function connectEdge(selector: string) {
  // React flow doesn't use onDragStart
  cy.get(selector).trigger('mousedown', { button: 0 });
  cy.get('[data-handleid="target-agent"]').trigger('mousemove').trigger('mouseup', { force: true });
}

describe('Agent Tools', () => {
  it('Editing sub-agent ID should not removes linked tools', () => {
    cy.visit('/default/projects/activities-planner');
    cy.contains('Create agent').click();
    cy.get('[name=name]').type(generateId(), { delay: 0 });
    cy.get('button[type=submit]').click();
    cy.get('[name$=".name"]').type('test', { delay: 0 });
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 1);

    dragNode('[aria-label="Drag Function Tool node"]');
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 2);
    connectEdge('[data-handleid="target-function-tool"]');
    cy.typeInMonaco('executeCode.js', 'function () {}');
    dragNode('[aria-label="Drag MCP node"]');
    cy.contains('Weather').click();
    connectEdge('[data-handleid="target-mcp"]');
    cy.contains('Connecting...').should('not.exist');
    cy.contains('Save changes').click();
    cy.contains('Agent saved', { timeout: 30_000 }).should('exist');
    cy.reload();
    cy.get('.react-flow__node', { timeout: 20_000 }).should('have.length', 3);
  });

  describe('Format', () => {
    it('JSON', () => {
      const uri = 'contextConfig.contextVariables.json';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      cy.typeInMonaco(uri, '{"foo":123}');
      cy.get(`[data-uri="file:///${uri}"]`).prev().contains('Format').click();
      cy.assertMonacoContent(uri, '{\n  "foo": 123\n}');
    });
    it('JavaScript', () => {
      const uri = 'executeCode.js';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      dragNode('[aria-label="Drag Function Tool node"]');
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
      const uri = 'prompt.template';

      cy.visit('/default/projects/activities-planner/agents/activities-planner?pane=agent');
      cy.typeInMonaco(uri, '#   hello   {{name}}');
      cy.contains('Format').click();
      cy.assertMonacoContent(uri, '# hello {{name}}');
    });
  });
});
