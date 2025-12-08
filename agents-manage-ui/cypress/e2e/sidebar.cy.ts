/// <reference types="cypress" />

describe('Sidebar', () => {
  describe('Collapsing/Expanding', () => {
    const projectUrl = '/default/projects/my-weather-project';

    it('should collapses when opening an agent page and re-expands when user navigates away from the agent page', () => {
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

    it('should collapses when opening an agent page and re-expands when opening new tab', () => {
      cy.visit(projectUrl);
      // Default expanded
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
      cy.contains('Weather agent').click();
      // Switched to collapsed
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      // Back to expanded
      cy.visit('/');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
    });

    it('should keeps the sidebar collapsed after a manual toggle and stay collapsed when opening new tab', () => {
      cy.visit(projectUrl);
      cy.contains('Toggle Sidebar').click();
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      cy.contains('Weather agent').click();
      cy.get('.react-flow__node').should('exist');
      cy.visit('/');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    });

    it.skip('should temporarily expands on hover and collapses again on blur', () => {
      cy.visit(`${projectUrl}/agents/weather-agent`);
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
      cy.get('[data-slot=sidebar]').trigger('mouseenter');
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'expanded');
      cy.get('.react-flow__node').then(([domEl]) => {
        cy.get('[data-slot=sidebar]').trigger('mouseleave', { relatedTarget: domEl });
      });
      cy.get('[data-slot=sidebar]').should('have.attr', 'data-state', 'collapsed');
    });
  });
});
