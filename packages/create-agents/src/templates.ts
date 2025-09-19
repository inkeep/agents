import degit from 'degit';
import fs from 'fs-extra';

//Duplicating function here so we dont have to add a dependency on the agents-cli package
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
    'https://api.github.com/repos/inkeep/agents-cookbook/contents/template-projects'
  );
  const contents = await response.json();

  return contents.filter((item: any) => item.type === 'dir').map((item: any) => item.name);
}
