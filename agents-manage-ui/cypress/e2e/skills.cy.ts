describe('Skills', () => {
  it('should create a skill', () => {
    const fixture = {
      name: 'test-skill',
      description: 'test-description',
      content: 'test-content',
      metadata: '{"foo":"only-string"}',
    };

    // Intercept the skills API to capture any errors
    cy.intercept('POST', '**/skills').as('createSkill');

    cy.visit('/default/projects/activities-planner/skills');
    cy.contains('Create skill').click();
    cy.get('[name=name]').type(fixture.name);
    cy.get('textarea[name=description]').type(fixture.description);
    cy.typeInMonaco('content.md', fixture.content);
    cy.typeInMonaco('metadata.json', fixture.metadata);
    cy.contains('Save').click();
    cy.wait('@createSkill', { timeout: 30_000 }).then((interception) => {
      const status = interception.response?.statusCode;
      const body = interception.response?.body;
      // Use Cypress.log for visibility in screenshots, and console for CI logs
      const msg = `Skills API response: status=${status}, body=${JSON.stringify(body).substring(0, 3000)}`;
      cy.log(msg);
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(msg);
      }
    });
    for (const text of Object.values(fixture)) {
      cy.contains(text).should('exist');
    }
  });
});
