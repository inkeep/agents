/// <reference types="cypress" />

describe('Sidebar', () => {
  it('should collapse sidebar in agent page', () => {
    cy.visit('/default/projects');
    // Default expanded
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
    cy.visit('/default/projects/my-weather-project/agents/weather-agent');
    // Switch to collapsed
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    // Back to expanded
    cy.contains('Projects').click();
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
  });
});
