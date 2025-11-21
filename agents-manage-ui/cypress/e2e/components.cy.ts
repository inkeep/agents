/// <reference types="cypress" />

describe('Components', () => {
  it('should create a new component when adding JSON schema properties with form builder and without `required` field', () => {
    cy.visit('/default/projects/my-weather-project/components/new');
    cy.get('input[name=name]').type(`test ${Math.random().toString().slice(2)}`);
    cy.get('textarea[name=description]').type('test description');
    cy.contains('Add property').click();
    cy.get('[placeholder="Property name"]').type('foo');
    cy.get('[placeholder="Add description"]').type('bar');
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

      const editorValue = {
        type: 'object',
        properties: {
          num: {
            type: 'number',
            inPreview: true,
          },
        },
      };
      cy.typeInMonaco('json-schema-data-component.json', JSON.stringify(editorValue));

      // Switch to form builder
      cy.get('[role=switch]').click();
      // Switch to JSON schema editor
      cy.get('[role=switch]').click();
      // Wait for updated editor value
      cy.contains('"additionalProperties": false').should('exist');

      cy.assertMonacoContent('json-schema-data-component.json', (content) => {
        const newEditorValue = {
          ...structuredClone(editorValue),
          additionalProperties: false,
        };
        delete newEditorValue.properties.num.inPreview;

        // To compare objects by value, deep equality
        expect(JSON.parse(content)).to.deep.equal(newEditorValue);
      });
    });
  });
});
