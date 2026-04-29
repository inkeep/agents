/// <reference types="cypress" />

// Multi-session tests below need a second active session beyond the cypress browser's.
// CI runs a single browser, so they self-skip when only one row is present. Run locally
// with a second browser/device signed in to exercise the revoke-non-current and
// revoke-others flows.

describe('Sessions', () => {
  it('renders the active sessions section with the current device on /profile', () => {
    cy.visit('/default/profile');
    cy.get('[data-slot=sessions-section]').should('exist');
    cy.contains('Active sessions').should('be.visible');
    cy.contains('Devices currently signed in to your account').should('be.visible');
    cy.get('[data-slot=session-row][data-current]').should('have.length', 1);
    cy.get('[data-slot=session-row][data-current]').contains('This device');
  });

  it('revokes a non-current session and removes the row', function () {
    cy.visit('/default/profile');
    cy.get('[data-slot=sessions-section]').should('exist');
    cy.get('body').then(($body) => {
      if ($body.find('[data-slot=session-row]:not([data-current])').length === 0) {
        this.skip();
      }
    });
    cy.get('[data-slot=session-row]:not([data-current])')
      .first()
      .find('[data-slot=session-revoke-button]')
      .click();
    cy.get('[role=dialog]').contains('Revoke session?').should('be.visible');
    cy.get('[role=dialog]').contains('button', 'Delete').click();
    cy.contains('Session revoked').should('be.visible');
    cy.get('[data-slot=session-row]').should('have.length', 1);
    cy.get('[data-slot=session-row][data-current]').should('exist');
  });

  it('revokes all other sessions via the panic button', function () {
    cy.visit('/default/profile');
    cy.get('[data-slot=sessions-section]').should('exist');
    cy.get('body').then(($body) => {
      if ($body.find('[data-slot=revoke-others-button]').length === 0) {
        this.skip();
      }
    });
    cy.get('[data-slot=revoke-others-button]').click();
    cy.get('[role=dialog]').contains('Revoke all other sessions?').should('be.visible');
    cy.get('[role=dialog]').contains('sign all other devices out').should('be.visible');
    cy.get('[role=dialog]').contains('button', 'Delete').click();
    cy.contains('All other sessions revoked').should('be.visible');
    cy.get('[data-slot=session-row]').should('have.length', 1);
    cy.get('[data-slot=session-row][data-current]').should('exist');
  });

  it('signs the user out of the current device when revoking their own session', () => {
    cy.visit('/default/profile');
    cy.get('[data-slot=session-row][data-current]')
      .find('[data-slot=session-revoke-button]')
      .click();
    cy.get('[role=dialog]').contains('Revoke this device?').should('be.visible');
    cy.get('[role=dialog]').contains('This will sign you out of this device').should('be.visible');
    cy.get('[role=dialog]').contains('button', 'Delete').click();
    cy.location('pathname', { timeout: 10_000 }).should('eq', '/login');
  });
});
