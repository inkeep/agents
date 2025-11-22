/// <reference types="cypress" />

import { randomId } from '../support/utils';

describe('Projects', () => {
  // it('should navigates to newly created project', () => {
  //   cy.visit('/');
  //   cy.contains('Create project').click();
  //   cy.get('[name=name]').type('test');
  //   cy.get('textarea[name=description]').type('test description');
  //   cy.get('[role=dialog]').contains('Create project').click();
  // });

  it.only('should navigate to projects page', () => {
    const projectName = `test ${randomId()}`;
    cy.visit('/default/projects/my-weather-project');
    cy.get('[data-slot=dropdown-menu-trigger]').contains('Weather Project').click();
    cy.contains('Create project').click();
    cy.get('[name=name]').type(projectName, { delay: 0 });
    cy.get('textarea[name=description]').type('test description');
    // cy.get('[role=dialog]').contains('Create project').click();
    // cy.get('[data-slot=dropdown-menu-trigger]').should('contain', projectName);
  });
});
