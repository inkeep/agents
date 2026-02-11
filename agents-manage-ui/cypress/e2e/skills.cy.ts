describe('Skills', () => {
  it('should create a skill', () => {
    const fixture = {
      name: 'test-skill',
      description: 'test-description',
      content: 'test-content',
      metadata: '{"foo":"only-string"}',
    };

    cy.visit('/default/projects/my-weather-project/skills');
    cy.contains('Create skill').click();
    cy.get('[name=name]').type(fixture.name);
    cy.get('textarea[name=description]').type(fixture.description);
    cy.typeInMonaco('content.md', fixture.content);
    cy.typeInMonaco('metadata.json', fixture.metadata);
    cy.contains('Save').click();
    for (const text of Object.values(fixture)) {
      cy.contains(text).should('exist');
    }
  });
});
