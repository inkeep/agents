import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { ManagementApiClient } from '../../../api';
import { pullSingleProject } from './index';
import { createProjectFixture } from './test-helpers';

vi.mock('../../../api', () => ({
  ManagementApiClient: {
    create: vi.fn(),
  },
}));

describe('pullSingleProject', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pull-v4-batch-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('generates skills for new projects during batch pull', async () => {
    const remoteProject: FullProjectDefinition = {
      ...createProjectFixture(),
      skills: {
        'general-gameplan': {
          name: 'general-gameplan',
          description: 'Generate a general gameplan.',
          content: 'Use this skill for general planning.',
        },
      },
    };

    vi.mocked(ManagementApiClient.create).mockResolvedValue({
      getFullProject: vi.fn().mockResolvedValue(remoteProject),
    } as unknown as Awaited<ReturnType<typeof ManagementApiClient.create>>);

    const result = await pullSingleProject(
      remoteProject.id,
      remoteProject.name,
      {},
      {
        agentsApiUrl: 'http://localhost:3002',
        tenantId: 'tenant-123',
        agentsApiKey: 'test-key',
      }
    );

    expect(result.success).toBe(true);

    const skillFilePath = join(testDir, remoteProject.id, 'skills', 'general-gameplan', 'SKILL.md');
    expect(fs.existsSync(skillFilePath)).toBe(true);
    expect(fs.readFileSync(skillFilePath, 'utf8')).toContain(
      'Use this skill for general planning.'
    );
  });
});
