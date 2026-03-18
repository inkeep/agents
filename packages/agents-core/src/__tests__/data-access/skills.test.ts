import { eq } from 'drizzle-orm';
import {
  createSkill,
  deleteSkill,
  getSkillByIdWithFiles,
  updateSkill,
} from '../../data-access/manage/skills';
import { skillFiles } from '../../db/manage/manage-schema';
import { createTestProject } from '../../db/manage/test-manage-client';
import { generateId } from '../../utils/conversations';
import { testManageDbClient } from '../setup';

describe('skills data access', () => {
  it('should synthesize SKILL.md when files are omitted', async () => {
    const tenantId = `tenant-${generateId()}`;
    const projectId = `project-${generateId()}`;
    await createTestProject(testManageDbClient, tenantId, projectId);

    const skill = await createSkill(testManageDbClient)({
      tenantId,
      projectId,
      name: 'weather-safety-guardrails',
      description: 'Safety rules.',
      content: 'Always check the weather.',
      metadata: { author: 'acme' },
    });

    expect(skill?.files).toMatchObject([
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
    ]);
  });

  it('should persist and retrieve nested skill files', async () => {
    const tenantId = `tenant-${generateId()}`;
    const projectId = `project-${generateId()}`;
    await createTestProject(testManageDbClient, tenantId, projectId);

    await createSkill(testManageDbClient)({
      tenantId,
      projectId,
      name: 'structured-itinerary-responses',
      description: 'Structured itineraries.',
      content: 'Use itinerary templates.',
      metadata: null,
      files: [
        {
          filePath: 'SKILL.md',
          content: `---
name: structured-itinerary-responses
description: "Structured itineraries."
---
Use itinerary templates.`,
        },
        {
          filePath: 'templates/day/itinerary-card.html',
          content: '<article>Plan</article>',
        },
      ],
    });

    const skill = await getSkillByIdWithFiles(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
    });

    expect(skill?.files.map((file) => file.filePath)).toEqual([
      'SKILL.md',
      'templates/day/itinerary-card.html',
    ]);
  });

  it('should replace the skill file set on update', async () => {
    const tenantId = `tenant-${generateId()}`;
    const projectId = `project-${generateId()}`;
    await createTestProject(testManageDbClient, tenantId, projectId);

    await createSkill(testManageDbClient)({
      tenantId,
      projectId,
      name: 'weather-safety-guardrails',
      description: 'Safety rules.',
      content: 'Always check the weather.',
      metadata: null,
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
          filePath: 'reference/safety-checklist.txt',
          content: 'Check weather alerts',
        },
      ],
    });

    const updated = await updateSkill(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'weather-safety-guardrails',
      data: {
        description: 'Updated safety rules.',
        content: 'Always check the weather and alerts.',
        files: [
          {
            filePath: 'SKILL.md',
            content: `---
name: weather-safety-guardrails
description: "Updated safety rules."
---
Always check the weather and alerts.`,
          },
          {
            filePath: 'templates/alert.md',
            content: 'Alert template',
          },
        ],
      },
    });

    expect(updated?.files.map((file) => file.filePath)).toEqual(['SKILL.md', 'templates/alert.md']);
  });

  it('should cascade delete skill files when deleting a skill', async () => {
    const tenantId = `tenant-${generateId()}`;
    const projectId = `project-${generateId()}`;
    await createTestProject(testManageDbClient, tenantId, projectId);

    await createSkill(testManageDbClient)({
      tenantId,
      projectId,
      name: 'weather-safety-guardrails',
      description: 'Safety rules.',
      content: 'Always check the weather.',
      metadata: null,
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
          filePath: 'reference/safety-checklist.txt',
          content: 'Check weather alerts',
        },
      ],
    });

    const removed = await deleteSkill(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'weather-safety-guardrails',
    });

    const remainingFiles = await testManageDbClient
      .select()
      .from(skillFiles)
      .where(eq(skillFiles.skillId, 'weather-safety-guardrails'));

    expect(removed).toBe(true);
    expect(remainingFiles).toEqual([]);
  });
});
