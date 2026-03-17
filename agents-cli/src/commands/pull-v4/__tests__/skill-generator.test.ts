import { generateSkillDefinition } from '../generators/skill-generator';

describe('Skill Generator', () => {
  it('generates skill markdown with metadata', () => {
    const content = generateSkillDefinition({
      skillId: 'general-gameplan',
      name: 'General Gameplan',
      description: 'Create a general plan.',
      metadata: {
        tools: ['planner', 'search'],
        priority: 'high',
      },
      content: 'Use this skill for planning.',
    });

    expect(content).toContain('---');
    expect(content).toContain('name: "General Gameplan"');
    expect(content).toContain('description: "Create a general plan."');
    expect(content).toContain('metadata:');
    expect(content).toContain('  tools:');
    expect(content).toContain('  - planner');
    expect(content).toContain('  - search');
    expect(content).toContain('  priority: high');
    expect(content).toContain('Use this skill for planning.');
  });

  it('omits metadata when it is empty', () => {
    const content = generateSkillDefinition({
      skillId: 'simple-skill',
      name: 'Simple Skill',
      description: '',
      metadata: {},
      content: 'Simple content.',
    });

    expect(content).toContain('name: "Simple Skill"');
    expect(content).not.toContain('metadata:');
    expect(content).toContain('Simple content.');
  });

  it('throws for invalid skill input', () => {
    expect(() => {
      generateSkillDefinition({
        skillId: '',
        // @ts-expect-error testing validation
        name: undefined,
      });
    }).toThrow(
      new Error(`Validation failed for skill:
✖ Invalid input: expected a nonempty string
  → at skillId
✖ Invalid input: expected string, received undefined
  → at name`)
    );
  });
});
