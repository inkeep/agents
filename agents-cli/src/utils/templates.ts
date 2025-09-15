import fs from 'fs-extra';
import degit from 'degit';


export async function cloneTemplate(templatePath: string, targetPath: string) {
    await fs.mkdir(targetPath, { recursive: true });

    const templatePathSuffix = templatePath.replace('https://github.com/', '');
    const emitter = degit(templatePathSuffix);
    try {
        await emitter.clone(targetPath);
      } catch (error) {
        process.exit(1);
      }
}

export async function getAvailableTemplates(): Promise<string[]> {
    // Fetch the list of templates from your repo
    const response = await fetch(
      'https://api.github.com/repos/inkeep/agents-cookbook/contents/templates'
    );
    const contents = await response.json();

    return contents
      .filter((item: any) => item.type === 'dir')
      .map((item: any) => item.name);
  }