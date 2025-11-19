/// <reference types="cypress" />

describe('Sidebar', () => {
  describe('Collapsing/Expanding', () => {
    const projectUrl = '/default/projects/my-weather-project';

    it('should collapses when opening an agent page and re-expands when returning to projects page', () => {
      cy.visit(projectUrl);
      // Default expanded
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
      cy.contains('Weather agent').click();
      // Switched to collapsed
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      // Back to expanded
      cy.contains('Projects').click();
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
    });

    it('should keeps the sidebar collapsed after a manual toggle even when leaving the agent page', () => {
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

    it('should temporarily expands on hover and collapses again on blur', () => {
      cy.visit(`${projectUrl}/agents/weather-agent`);
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      cy.get('[data-slot=sidebar]').trigger('mouseover');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
      cy.get('[data-slot=sidebar]').trigger('mouseout');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    });
  });
});
