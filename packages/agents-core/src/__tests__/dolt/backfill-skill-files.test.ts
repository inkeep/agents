import { describe, expect, it } from 'vitest';
import {
  buildLegacySkillFileId,
  buildMissingSkillFileRows,
  parseBackfillSkillFilesArgs,
} from '../../dolt/backfill-skill-files';

describe('backfill skill files helpers', () => {
  it('builds a stable legacy skill file id', () => {
    expect(
      buildLegacySkillFileId({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        id: 'my-skill',
      })
    ).toBe('legacy-05c1c499b6f1365757f814dc45e1f3ad');
  });

  it('builds missing SKILL.md rows from skills without an entry file', () => {
    const rows = buildMissingSkillFileRows(
      [
        {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          id: 'my-skill',
          name: 'my-skill',
          description: 'Helpful description',
          content: 'Skill body',
          metadata: { audience: 'internal' },
          createdAt: '2026-03-31T00:00:00.000Z',
          updatedAt: '2026-03-31T00:00:00.000Z',
        },
      ],
      []
    );

    expect(rows).toEqual([
      {
        tenantId: 'tenant-1',
        id: 'legacy-05c1c499b6f1365757f814dc45e1f3ad',
        projectId: 'project-1',
        skillId: 'my-skill',
        filePath: 'SKILL.md',
        content: `---
name: my-skill
description: Helpful description
metadata:
  audience: internal
---

Skill body`,
        createdAt: '2026-03-31T00:00:00.000Z',
        updatedAt: '2026-03-31T00:00:00.000Z',
      },
    ]);
  });

  it('skips skills that already have SKILL.md files', () => {
    const rows = buildMissingSkillFileRows(
      [
        {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          id: 'my-skill',
          name: 'my-skill',
          description: 'Helpful description',
          content: 'Skill body',
          metadata: null,
          createdAt: '2026-03-31T00:00:00.000Z',
          updatedAt: '2026-03-31T00:00:00.000Z',
        },
      ],
      [
        {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          skillId: 'my-skill',
        },
      ]
    );

    expect(rows).toEqual([]);
  });

  it('parses CLI flags', () => {
    expect(
      parseBackfillSkillFilesArgs([
        '--apply',
        '--branch',
        'main',
        '--skip-main',
        '--continue-on-error',
      ])
    ).toEqual({
      apply: true,
      branchNames: ['main'],
      continueOnError: true,
      help: false,
      includeMain: false,
    });
  });
});
