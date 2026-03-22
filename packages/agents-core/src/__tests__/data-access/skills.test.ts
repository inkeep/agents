import { eq } from 'drizzle-orm';
import {
  createSkill,
  createSkillFileById,
  deleteSkill,
  deleteSkillFileById,
  getSkillByIdWithFiles,
  getSkillFileById,
  updateSkill,
  updateSkillFileById,
} from '../../data-access/manage/skills';
import { skillFiles } from '../../db/manage/manage-schema';
import { createTestProject } from '../../db/manage/test-manage-client';
import { generateId } from '../../utils/conversations';
import { testManageDbClient } from '../setup';

describe('skills data access', () => {
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

  it('should preserve file ids when updating existing file paths', async () => {
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

    const original = await getSkillByIdWithFiles(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'weather-safety-guardrails',
    });

    const originalIds = Object.fromEntries(
      (original?.files ?? []).map((file) => [file.filePath, file.id])
    );

    const updated = await updateSkill(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'weather-safety-guardrails',
      data: {
        description: 'Updated safety rules.',
        metadata: null,
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
            filePath: 'reference/safety-checklist.txt',
            content: 'Check alerts twice',
          },
        ],
      },
    });

    expect(
      Object.fromEntries((updated?.files ?? []).map((file) => [file.filePath, file.id]))
    ).toEqual(originalIds);
  });

  it('should create, update, and delete individual skill files by id', async () => {
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
      ],
    });

    const createdFile = await createSkillFileById(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
      data: {
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Plan</article>',
      },
    });

    expect(createdFile).toEqual(
      expect.objectContaining({
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Plan</article>',
      })
    );

    const updatedFile = await updateSkillFileById(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
      fileId: createdFile!.id,
      content: '<article>Updated plan</article>',
    });

    expect(updatedFile).toEqual(
      expect.objectContaining({
        id: createdFile!.id,
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Updated plan</article>',
      })
    );

    const fetchedFile = await getSkillFileById(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
      fileId: createdFile!.id,
    });
    expect(fetchedFile?.content).toBe('<article>Updated plan</article>');

    const removed = await deleteSkillFileById(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
      fileId: createdFile!.id,
    });

    expect(removed).toBe(true);

    const afterDelete = await getSkillByIdWithFiles(testManageDbClient)({
      scopes: { tenantId, projectId },
      skillId: 'structured-itinerary-responses',
    });

    expect(afterDelete?.files.map((file) => file.filePath)).toEqual(['SKILL.md']);
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
