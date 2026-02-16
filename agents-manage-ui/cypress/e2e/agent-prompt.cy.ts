/// <reference types="cypress" />

describe('Agent Prompt', () => {
  it('should suggest autocomplete in prompt editor from context variables editor and headers JSON schema editor', () => {
    cy.visit('/default/projects/my-weather-project/agents/weather-agent?pane=agent');

    cy.typeInMonaco('contextVariables.json', '{"contextVariablesValue":123}');
    const headersJsonSchema = {
      type: 'object',
      properties: {
        testHeadersJsonSchemaValue: { type: 'string' },
      },
    };
    cy.typeInMonaco('headersSchema.json', JSON.stringify(headersJsonSchema));
    cy.contains('Save changes').click();

    cy.typeInMonaco('agent-prompt.template', '{');
    cy.get('[aria-label=Suggest]').contains('contextVariablesValue');
    cy.get('[aria-label=Suggest]').contains('headers.testHeadersJsonSchemaValue');
    cy.get('[aria-label=Suggest]').contains('$env.');
  });

  it('should highlight as error unknown variables', () => {
    cy.visit('/default/projects/my-weather-project/agents/weather-agent?pane=agent');
    cy.typeInMonaco('agent-prompt.template', 'Hello {{unknown}} {{$env.MY_ENV}}');
    cy.get('.squiggly-error').should('have.length', 1);
  });
});
