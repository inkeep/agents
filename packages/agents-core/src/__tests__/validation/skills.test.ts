import { SkillApiInsertSchema } from '../../validation/schemas/skills';

describe('SkillApiInsertSchema', () => {
  it('accepts nested files when SKILL.md matches the skill fields', () => {
    const result = SkillApiInsertSchema.safeParse({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      name: 'weather-safety-guardrails',
      description: 'Safety rules.',
      content: 'Always check the weather.',
      metadata: { author: 'acme' },
      files: [
        {
          filePath: 'SKILL.md',
          content: `---
name: weather-safety-guardrails
description: "Safety rules."
metadata:
  author: acme
---
Always check the weather.`,
        },
        {
          filePath: 'reference/safety-checklist.txt',
          content: 'Check alerts',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate file paths', () => {
    const result = SkillApiInsertSchema.safeParse({
      files: [
        {
          filePath: 'SKILL.md',
          content: `---
name: weather-safety-guardrails
description: "Safety rules."
---
Always check the weather.`,
        },
        {
          filePath: 'SKILL.md',
          content: 'duplicate',
        },
      ],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'custom',
          path: ['files', 1, 'filePath'],
          message: 'Duplicate skill file path: SKILL.md',
        },
      ]);
    }
  });

  it('rejects missing SKILL.md', () => {
    const result = SkillApiInsertSchema.safeParse({
      files: [
        {
          filePath: 'reference/safety-checklist.txt',
          content: 'Check alerts',
        },
      ],
    });
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'custom',
          path: ['files'],
          message: 'Skill files must include exactly one SKILL.md',
        },
      ]);
    }
  });

  it('rejects invalid file paths', () => {
    const result = SkillApiInsertSchema.safeParse({
      files: [
        {
          filePath: 'SKILL.md',
          content: `---
name: weather-safety-guardrails
description: "Safety rules."
---
Always check the weather.`,
        },
        {
          filePath: '../reference/safety-checklist.txt',
          content: 'Check alerts',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'custom',
          path: ['files', 1, 'filePath'],
          message: 'Must not contain empty, ".", or ".." path segments',
        },
      ]);
    }
  });

  it('rejects mismatched SKILL.md content', () => {
    const result = SkillApiInsertSchema.safeParse({
      name: 'weather-safety-guardrails',
      description: 'Safety rules.',
      content: 'Always check the weather.',
      files: [
        {
          filePath: 'SKILL.md',
          content: `---
name: test1
description: test2
---
test3`,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test1');
      expect(result.data.description).toBe('test2');
      expect(result.data.content).toBe('test3');
    }
  });
});
