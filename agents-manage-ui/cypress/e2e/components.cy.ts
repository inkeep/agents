/// <reference types="cypress" />

describe('Components', () => {
  it('should create a new component when adding JSON schema properties with form builder', () => {
    cy.visit('/default/projects/my-weather-project/components/new');
    cy.get('input[name=name]').type('test name');
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
});
