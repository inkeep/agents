/// <reference types="cypress" />

describe('Monaco Editor', () => {
  it('should update the SubAgent prompt editor when switching nodes', () => {
    // Assert 1st node
    cy.visit('/default/projects/my-weather-project/agents/weather-agent?nodeId=geocoder-agent');
    cy.contains('You are a geocoding specialist').should('be.visible');

    // Assert 2nd node
    cy.get('.react-flow__node').contains('Weather forecaster').click();
    cy.contains('You are a weather forecasting').should('be.visible');

    // Reassert 1st node (`value` should be replaced)
    cy.get('.react-flow__node').contains('Geocoder agent').click({ force: true });
    cy.contains('You are a geocoding specialist').should('be.visible');
  });

  it('should focus the editor when clicking on the `<label>`', () => {
    cy.visit('/default/projects/my-weather-project/agents/weather-agent?nodeId=geocoder-agent');
    cy.contains('You are a geocoding specialist').should('be.visible');
    cy.get('#prompt-label').click();
    cy.get('[data-uri="file:///prompt.template"].focused').should('be.visible');
  });
});
