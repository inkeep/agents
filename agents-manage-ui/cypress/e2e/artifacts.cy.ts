/// <reference types="cypress" />

describe('Artifacts', () => {
  it('should have `inPreview` on page and should add `inPreview` fields to JSON schema', () => {
    cy.visit('/default/projects/my-weather-project/artifacts/new');
    cy.contains('In Preview').should('exist');
    cy.contains('Add property').click();
    // Add object `obj` with `inPreview`
    cy.get('[role=combobox]').click();
    cy.get('[role=option]').contains('object').click();
    cy.get('[role=checkbox]').eq(0).click();
    cy.get('[placeholder="Property name"]').eq(0).type('obj');
    // Add number `obj.num` with `inPreview`
    cy.contains('Add property').eq(0).click();
    cy.get('[role=combobox]').last().click();
    cy.get('[role=option]').contains('number').click();
    cy.get('[role=checkbox]').eq(2).click();
    cy.get('[placeholder="Property name"]').last().type('num');
    // Add string `obj.str` without `inPreview`
    cy.contains('Add property').click();
    cy.get('[placeholder="Property name"]').last().type('str');
    // Switch to JSON schema editor
    cy.get('[role=switch]').click();

    cy.window().then((win) => {
      const [jsonModel] = (win.monaco as typeof import('monaco-editor')).editor.getModels();
      const editorValue = {
        type: 'object',
        properties: {
          obj: {
            type: 'object',
            properties: {
              num: {
                type: 'number',
                inPreview: true,
              },
              str: { type: 'string' },
            },
            additionalProperties: false,
            inPreview: true,
          },
        },
        additionalProperties: false,
      };

      expect(jsonModel.getValue()).to.eq(JSON.stringify(editorValue, null, 2));
    });
  });
});
