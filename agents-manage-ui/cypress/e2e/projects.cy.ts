/// <reference types="cypress" />

import { randomId } from '../support/utils';

describe('Projects', () => {
  it('should create project, navigate to agents page and update project switcher', () => {
    const projectName = `test${randomId()}`;
    cy.visit('/default/projects/activities-planner');
    cy.get('[data-slot=dropdown-menu-trigger]').contains('Activities planner').click();
    cy.contains('Create project').click();
    cy.get('[name=name]').type(projectName, { delay: 0 });
    cy.get('textarea[name=description]').type('test description');
    cy.get('[role=dialog]').contains('Create project').click();
    cy.location('pathname').should('eq', `/default/projects/${projectName}/agents`);
    cy.get('[data-slot=dropdown-menu-trigger]').should('contain', projectName);
  });
});
