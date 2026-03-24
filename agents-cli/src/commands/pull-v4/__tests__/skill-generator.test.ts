import { generateSkillDefinition, generateSkillFiles } from '../generators/skill-generator';

describe('Skill Generator', () => {
  it('generates skill markdown with metadata', () => {
    const content = generateSkillDefinition({
      name: 'general-gameplan',
      description: 'Create a general plan.',
      metadata: {
        tools: 'true',
        priority: 'high',
      },
      content: 'Use this skill for planning.',
    });

    expect(content).toContain('---');
    expect(content).toContain('name: general-gameplan');
    expect(content).toContain('description: Create a general plan.');
    expect(content).toContain('metadata:');
    expect(content).toContain('  tools: "true"');
    expect(content).toContain('  priority: high');
    expect(content).toContain('Use this skill for planning.');
  });

  it('omits metadata when it is empty', () => {
    const content = generateSkillDefinition({
      name: 'simple-skill',
      description: '#',
      metadata: {},
      content: 'Simple content.',
    });

    expect(content).toContain('name: simple-skill');
    expect(content).not.toContain('metadata:');
    expect(content).toContain('Simple content.');
  });

  it('returns explicit skill files when provided', () => {
    const files = [
      {
        filePath: 'SKILL.md',
        content: `---
name: general-gameplan
description: "Create a general plan."
---
Use this skill for planning.`,
      },
      {
        filePath: 'templates/checklist.md',
        content: '# Checklist',
      },
    ];

    const result = generateSkillFiles({
      name: 'general-gameplan',
      description: 'Create a general plan.',
      metadata: {
        tools: 'true',
      },
      content: 'Use this skill for planning.',
      files,
    });

    expect(result).toStrictEqual(files);
  });

  it('throws for invalid skill input', () => {
    expect(() => {
      // @ts-expect-error testing validation
      generateSkillDefinition({});
    }).toThrow(
      new Error(`Validation failed for skill:
✖ Invalid input: expected string, received undefined
  → at name
✖ Invalid input: expected string, received undefined
  → at description
✖ Invalid input: expected string, received undefined
  → at content
✖ Must be valid JSON object
  → at metadata`)
    );
  });
});
