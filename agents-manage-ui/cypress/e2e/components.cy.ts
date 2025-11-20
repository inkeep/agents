/// <reference types="cypress" />

describe('Components', () => {
  it('should create a new component when adding JSON schema properties with form builder', () => {
    cy.visit('/default/projects/my-weather-project/components/new');
    cy.get('input[name=name]').type(`test ${Math.random().toString().slice(2)}`);
    cy.get('textarea[name=description]').type('test description');
    cy.contains('Add property').click();
    cy.get('[placeholder="Property name"]').type('foo');
    cy.get('[placeholder="Add description"]').type('bar');
    cy.get('[role=checkbox').click();
    cy.contains('Save').click();
    cy.get('[data-sonner-toast]').contains('Component created').should('exist');
    // Should redirect
    cy.location('pathname').should('eq', '/default/projects/my-weather-project/components');
  });

  it('should not override json schema when json mode is enabled by default', () => {
    cy.visit('/default/projects/my-weather-project/components/weather-forecast');
    cy.get('[role=switch]').click();
    cy.reload();
    cy.contains('Weather code at given time').should('exist');
  });

  describe('inPreview', () => {
    it('should not have `inPreview` flag', () => {
      cy.visit('/default/projects/my-weather-project/components/new');
      cy.contains('Add property').should('exist');
      cy.contains('In Preview').should('not.exist');
    });

    it('should remove `inPreview` fields from editor', () => {
      cy.visit('/default/projects/my-weather-project/components/new');
      cy.get('[role=switch]').click();

      cy.window().then((win) => {
        const [jsonModel] = (win.monaco as typeof import('monaco-editor')).editor.getModels();
        const editorValue = {
          type: 'object',
          properties: {
            num: {
              type: 'number',
              inPreview: true,
            },
          },
        };

        jsonModel.setValue(JSON.stringify(editorValue, null, 2));

        // Switch to form builder
        cy.get('[role=switch]').click();
        // Switch to JSON schema editor
        cy.get('[role=switch]').click();
        // Wait for updated editor value
        cy.contains('"additionalProperties": false').should('exist');

        cy.wrap(null).should(() => {
          const newEditorValue = {
            ...structuredClone(editorValue),
            additionalProperties: false,
          };
          delete newEditorValue.properties.num.inPreview;
          const [jsonModel] = win.monaco.editor.getModels();
          expect(jsonModel.getValue()).to.eq(JSON.stringify(newEditorValue, null, 2));
        });
      });
    });
  });
});
