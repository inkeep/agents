import * as p from '@clack/prompts';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import chalk from 'chalk';
import { findUp } from 'find-up';
import fs from 'fs-extra';
import { type ContentReplacement, cloneTemplate, getAvailableTemplates } from '../utils/templates';

export interface AddOptions {
  project?: string;
  mcp?: string;
  targetPath?: string;
  config?: string;
  list: boolean;
}

export const defaultGoogleModelConfigurations = {
  base: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH,
  },
  structuredOutput: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
  summarizer: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: OPENAI_MODELS.GPT_4_1,
  },
  structuredOutput: {
    model: OPENAI_MODELS.GPT_4_1_MINI,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO,
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  structuredOutput: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  summarizer: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
};

export async function addCommand(options: AddOptions) {
  const projectTemplates = await getAvailableTemplates('template-projects');
  const mcpTemplates = await getAvailableTemplates('template-mcps');
  if (!options.project && !options.mcp) {
    console.log(chalk.yellow('Available project templates:'));
    for (const template of projectTemplates) {
      console.log(chalk.gray(`  • ${template}`));
    }
    console.log(chalk.yellow('Available MCP templates:'));
    for (const template of mcpTemplates) {
      console.log(chalk.gray(`  • ${template}`));
    }
    process.exit(0);
  } else {
    if (options.project && !projectTemplates.includes(options.project)) {
      console.error(`❌ Project template "${options.project}" not found`);
      process.exit(1);
    }
    if (options.mcp && !mcpTemplates.includes(options.mcp)) {
      console.error(`❌ MCP template "${options.mcp}" not found`);
      process.exit(1);
    }

    const s = p.spinner();
    s.start('Adding template...');
    if (options.project) {
      await addProjectTemplate(options.project, options.targetPath);
      s.stop(`Project template "${options.project}" added to ${options.targetPath}`);
    }
    if (options.mcp) {
      await addMcpTemplate(options.mcp, options.targetPath, s);
    }
    return;
  }
}

export async function addProjectTemplate(template: string, targetPath: string | undefined) {
  const templates = await getAvailableTemplates();
  if (!template) {
    console.log(chalk.yellow('Available templates:'));
    for (const template of templates) {
      console.log(chalk.gray(`  • ${template}`));
    }
    process.exit(0);
  } else {
    if (!templates.includes(template)) {
      console.error(`❌ Template "${template}" not found`);
      process.exit(1);
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    let defaultModelSettings = {};
    if (anthropicKey) {
      defaultModelSettings = defaultAnthropicModelConfigurations;
    } else if (openAiKey) {
      defaultModelSettings = defaultOpenaiModelConfigurations;
    } else if (googleKey) {
      defaultModelSettings = defaultGoogleModelConfigurations;
    }

    const contentReplacements: ContentReplacement[] = [
      {
        filePath: 'index.ts',
        replacements: {
          models: defaultModelSettings,
        },
      },
    ];

    // Check if the model settings are empty
    if (Object.keys(defaultModelSettings).length === 0) {
      console.error(
        '❌ No AI provider key found in environment variables. Please set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
      );
    }

    // Determine the base directory (use provided target path or current directory)
    const baseDir = targetPath || process.cwd();

    // Create the full path including the template name as a subdirectory
    const templateDir = `${baseDir}/${template}`;

    // Check if the template directory already exists
    if (await fs.pathExists(templateDir)) {
      console.error(`❌ Directory "${templateDir}" already exists`);
      process.exit(1);
    }

    // Ensure the base directory exists
    if (targetPath && !(await fs.pathExists(baseDir))) {
      try {
        await fs.mkdir(baseDir, { recursive: true });
      } catch (error) {
        console.error(
          `❌ Failed to create target directory "${baseDir}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    }

    const s = p.spinner();
    s.start('Adding template...');
    const fullTemplatePath = `https://github.com/inkeep/agents-cookbook/template-projects/${template}`;

    // Clone into the template-named subdirectory
    await cloneTemplate(fullTemplatePath, templateDir, contentReplacements);
    s.stop(`Template "${template}" added to ${templateDir}`);
    return;
  }
}

export async function addMcpTemplate(template: string, targetPath: string | undefined, s: any) {
  const templates = await getAvailableTemplates('template-mcps');
  if (!template) {
    console.log(chalk.yellow('Available templates:'));
    for (const template of templates) {
      console.log(chalk.gray(`  • ${template}`));
    }
    process.exit(0);
  }

  if (!targetPath) {
    const foundPath = await findAppDirectory();
    targetPath = `${foundPath}/${template}`;
  }
  const fullTemplatePath = `https://github.com/inkeep/agents-cookbook/template-mcps/${template}`;
  await cloneTemplate(fullTemplatePath, targetPath);
  s.stop(`MCP template "${template}" added to ${targetPath}`);
}

export async function findAppDirectory() {
  const appDirectory = await findUp('apps/mcp/app', { type: 'directory' });
  if (!appDirectory || !appDirectory.includes('apps/mcp/app')) {
    console.log(chalk.yellow(`⚠️  No app directory found.`));
    const continueAnyway = await p.confirm({
      message: `Do you want to add to ${process.cwd()} instead?`,
    });

    if (!continueAnyway) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    return process.cwd();
  }
  return appDirectory;
}
