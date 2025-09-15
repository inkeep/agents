import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export async function cloneTemplate(targetPath: string) {
  await fs.mkdir(targetPath, { recursive: true });

  try {
    const agentsTemplateRepo = 'inkeep/create-agents-template';
    const degitCommand = `npx degit ${agentsTemplateRepo} ${targetPath}`;
    await execAsync(degitCommand, {
      cwd: process.cwd(),
    });
  } catch {
    // Fallback to git clone + remove .git
    try {
      const agentsTemplateRepo = 'https://github.com/inkeep/create-agents-template';
      const gitCommand = `git clone ${agentsTemplateRepo} ${targetPath}`;
      await execAsync(gitCommand, {
        cwd: process.cwd(),
      });

      // Remove .git directory
      const gitDir = path.join(targetPath, '.git');
      if (await fs.pathExists(gitDir)) {
        await fs.rm(gitDir, { recursive: true, force: true });
      }
    } catch (gitError) {
      throw new Error(`Failed to clone repository: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`);
    }
  }
}
