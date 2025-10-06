/// <reference types="cypress" />

describe('Validation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('validate only prompt for agent', () => {
    cy.type('{cmd}{s}');
  });
});
