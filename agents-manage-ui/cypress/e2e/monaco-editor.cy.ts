/// <reference types="cypress" />

describe('Monaco Editor', () => {
  it('should update the SubAgent prompt editor when switching nodes', () => {
    // Assert 1st node
    cy.visit(
      '/default/projects/activities-planner/agents/activities-planner?nodeId=get-coordinates-agent'
    );
    cy.contains('You are a helpful assistant responsible for converting location').should(
      'be.visible'
    );

    // Assert 2nd node
    cy.get('.react-flow__node').contains('Weather forecaster').click();
    cy.contains('You are a helpful assistant responsible for taking in coordinates').should(
      'be.visible'
    );

    // Reassert 1st node (`value` should be replaced)
    cy.get('.react-flow__node').contains('Coordinates agent').click({ force: true });
    cy.contains('You are a helpful assistant responsible for converting location').should(
      'be.visible'
    );
  });

  it('should focus the editor when clicking on the `<label>`', () => {
    cy.visit(
      '/default/projects/activities-planner/agents/activities-planner?nodeId=get-coordinates-agent'
    );
    cy.contains('You are a helpful assistant responsible for converting location').should(
      'be.visible'
    );
    cy.get('#prompt-label').click();
    cy.get('[data-uri="file:///prompt.template"].focused').should('be.visible');
  });
});
