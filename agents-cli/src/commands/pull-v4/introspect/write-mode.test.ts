import fs from 'node:fs';
import { join } from 'node:path';
import type { ProjectPaths } from '../generators/introspect-generator';
import { introspectGenerate } from '../generators/introspect-generator';
import {
  beforeCredentialContent,
  cleanupTestEnvironment,
  createProjectFixture,
  createTestEnvironment,
  createUnifiedDiff,
  getTestPath,
} from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('merges generated code with existing files by default', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });
    fs.writeFileSync(credentialFile, beforeCredentialContent);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: afterCredentialContent } = await import(`${credentialFile}?raw`);
    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      beforeCredentialContent,
      afterCredentialContent
    );
    await expect(credentialDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });

  it('overwrites existing files when writeMode is overwrite', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });
    fs.writeFileSync(credentialFile, beforeCredentialContent);

    await introspectGenerate({
      project,
      paths: projectPaths,
      writeMode: 'overwrite',
    });

    const { default: afterCredentialContent } = await import(`${credentialFile}?raw`);
    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      beforeCredentialContent,
      afterCredentialContent
    );

    await expect(credentialDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });
});
