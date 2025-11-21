/// <reference types="cypress" />

describe('Agent', () => {
  describe('Unsaved changes dialog', () => {
    beforeEach(() => {
      cy.visit('/default/projects/my-weather-project/agents/weather-agent?nodeId=geocoder-agent');
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

  describe('Prompt', () => {
    it.only('should suggest autocomplete in prompt editor from context variables editor and headers JSON schema editor', () => {
      cy.visit('/default/projects/my-weather-project/agents/weather-agent?pane=agent');

      cy.get('[data-uri="file:///contextVariables.json"] textarea')
        .type('{selectall}{del}', { force: true })
        .type('{"contextVariablesValue":123}', {
          parseSpecialCharSequences: false,
          delay: 0,
        });

      const headersJsonSchema = {
        type: 'object',
        properties: {
          testHeadersJsonSchemaValue: { type: 'string' },
        },
      };
      cy.get('[data-uri="file:///headersSchema.json"] textarea')
        .type('{selectall}{del}', { force: true })
        .type(JSON.stringify(headersJsonSchema), {
          parseSpecialCharSequences: false,
          delay: 0,
        });
      cy.contains('Save changes').click();

      cy.get('[data-uri="file:///agent-prompt.template"] textarea')
        .type('{selectall}{del}', { force: true })
        .type('{');
      cy.get('[aria-label=Suggest]').contains('contextVariablesValue');
      cy.get('[aria-label=Suggest]').contains('headers.testHeadersJsonSchemaValue');
      cy.get('[aria-label=Suggest]').contains('$env.');
    });
  });
});
