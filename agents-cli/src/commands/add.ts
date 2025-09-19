import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { cloneTemplate, getAvailableTemplates } from '../utils/templates';

export interface AddOptions {
  template?: string;
  targetPath?: string;
  list: boolean;
}

export async function addCommand(options: AddOptions) {
  const templates = await getAvailableTemplates();
  if (!options.template) {
    console.log(chalk.yellow('Available templates:'));
    for (const template of templates) {
      console.log(chalk.gray(`  • ${template}`));
    }
    process.exit(0);
  } else {
    if (!templates.includes(options.template)) {
      console.error(`❌ Template "${options.template}" not found`);
      process.exit(1);
    }

    // Determine the base directory (use provided target path or current directory)
    const baseDir = options.targetPath || process.cwd();

    // Create the full path including the template name as a subdirectory
    const templateDir = `${baseDir}/${options.template}`;

    // Check if the template directory already exists
    if (await fs.pathExists(templateDir)) {
      console.error(`❌ Directory "${templateDir}" already exists`);
      process.exit(1);
    }

    // Ensure the base directory exists
    if (options.targetPath && !(await fs.pathExists(baseDir))) {
      try {
        await fs.mkdir(baseDir, { recursive: true });
      } catch (error) {
        console.error(
          `❌ Failed to create target directory "${baseDir}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    }

    const spinner = ora('Adding template...').start();
    const fullTemplatePath = `https://github.com/inkeep/agents-cookbook/template-projects/${options.template}`;

    // Clone into the template-named subdirectory
    await cloneTemplate(fullTemplatePath, templateDir);
    spinner.succeed(`Template "${options.template}" added to ${templateDir}`);
    return;
  }
}
