/// <reference types="cypress" />

import { randomId } from '../support/utils';

describe('Create Agent', () => {
  const tenantId = 'default';
  const projectId = 'my-weather-project';
  const baseUrl = `/${tenantId}/projects/${projectId}/agents`;
  const createdAgents: string[] = [];

  const openNewAgentDialog = () => {
    // Wait for page to fully load by checking for either:
    // 1. "New Agent" button (empty state - no agents)
    // 2. "Create agent" text (agent list view)
    cy.contains(/New Agent|Create agent/i, { timeout: 15000 })
      .should('be.visible')
      .should('not.be.disabled')
      .click();
    // Wait for dialog to appear
    cy.get('[role=dialog]', { timeout: 15000 }).should('be.visible');
  };

  beforeEach(() => {
    cy.visit(baseUrl);
    // Wait for page content to be visible before proceeding
    cy.get('main', { timeout: 15000 }).should('be.visible');
    // Wait for React hydration to complete in CI headless mode
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(500);
  });

  after(() => {
    createdAgents.forEach((id) => {
      cy.deleteAgent(tenantId, projectId, id);
    });
  });

  it('should create agent and navigate to agent page', () => {
    const agentName = `Test Agent ${randomId()}`;
    const agentId = `test-agent-${randomId()}`;

    openNewAgentDialog();

    cy.get('[role=dialog]').within(() => {
      cy.get('input[name="name"]').clear({ force: true }).type(agentName, { force: true });
      cy.get('input[name="id"]').clear({ force: true }).type(agentId, { force: true });
      cy.contains('button', 'Create agent').click({ force: true });
    });

    cy.get('[data-sonner-toast]', { timeout: 10000 })
      .contains('Agent created!')
      .should('be.visible');
    cy.location('pathname', { timeout: 10000 }).should('eq', `${baseUrl}/${agentId}`);
    cy.get('[role=dialog]').should('not.exist');

    createdAgents.push(agentId);
  });

  it('should show validation errors for empty required fields', () => {
    openNewAgentDialog();

    cy.get('[role=dialog]').within(() => {
      cy.get('input[name="name"]').clear({ force: true });
      cy.get('input[name="id"]').clear({ force: true });
      cy.contains('button', 'Create agent').click({ force: true });
    });

    cy.contains('Name is required').should('be.visible');
    cy.contains('Id is required').should('be.visible');
  });

  it('should show validation error for invalid id format', () => {
    openNewAgentDialog();

    cy.get('[role=dialog]').within(() => {
      cy.get('input[name="name"]').clear({ force: true }).type('Test Agent', { force: true });
      cy.get('input[name="id"]').clear({ force: true }).type('test@agent#id', { force: true });
      cy.contains('button', 'Create agent').click({ force: true });
    });

    cy.contains('Id must contain only alphanumeric characters, underscores, and dashes').should(
      'be.visible'
    );
  });

  it('should show error toast for duplicate agent id', () => {
    const agentName = `Test Agent ${randomId()}`;
    const agentId = `test-agent-${randomId()}`;

    openNewAgentDialog();

    cy.get('[role=dialog]').within(() => {
      cy.get('input[name="name"]').clear({ force: true }).type(agentName, { force: true });
      cy.get('input[name="id"]').clear({ force: true }).type(agentId, { force: true });
      cy.contains('button', 'Create agent').click({ force: true });
    });

    cy.location('pathname', { timeout: 10000 }).should('include', `${baseUrl}/${agentId}`);
    createdAgents.push(agentId);

    cy.visit(baseUrl);
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(500);

    openNewAgentDialog();

    cy.get('[role=dialog]').within(() => {
      cy.get('input[name="name"]').clear({ force: true }).type('Different Name', { force: true });
      cy.get('input[name="id"]').clear({ force: true }).type(agentId, { force: true });
      cy.contains('button', 'Create agent').click({ force: true });
    });

    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(500);
    cy.get('[data-sonner-toast]', { timeout: 10000 }).should('exist');
    cy.contains(/already exists|Failed to create agent/i, { timeout: 10000 }).should('exist');
    cy.get('[role=dialog]').should('be.visible');
  });
});
