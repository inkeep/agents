/// <reference types="cypress" />

describe('Sidebar', () => {
  describe('Collapsing/Expanding', () => {
    const projectUrl = '/default/projects/my-weather-project';

    it('should collapse sidebar in agent page', () => {
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

    it('should not back to expanded if user manually collapsed when leaving agent page', () => {
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

    it('should expand on hover, and collapse on blur', () => {
      cy.visit(`${projectUrl}/agents/weather-agent`);
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      cy.get('[data-slot=sidebar]').trigger('mouseover');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
      cy.get('[data-slot=sidebar]').trigger('mouseout');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    });
  });
});
