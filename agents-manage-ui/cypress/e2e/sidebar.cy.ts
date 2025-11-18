/// <reference types="cypress" />

describe('Sidebar', () => {
  const projectUrl = '/default/projects/my-weather-project';
  it.only('should collapse sidebar in agent page', () => {
    cy.visit(projectUrl);
    // Default expanded
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
    cy.visit('/default/projects/my-weather-project/agents/weather-agent');
    // Switched to collapsed
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    // Back to expanded
    cy.contains('Projects').click();
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
  });

  it('should not expand if user collapsed', () => {
    cy.visit(projectUrl);
    cy.contains('Toggle Sidebar').click();
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    cy.contains('Weather agent').click();
    cy.get('.react-flow__node').should('exist');
    // Still collapsed
    cy.contains('Projects').click();
    cy.location('pathname').should('eq', '/default/projects');
    cy.contains('Weather Project').should('exist');
    cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
  });
});
