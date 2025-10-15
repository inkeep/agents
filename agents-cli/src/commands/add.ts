import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { type ContentReplacement, cloneTemplate, getAvailableTemplates } from '../utils/templates';

export interface AddOptions {
  template?: string;
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
    model: OPENAI_MODELS.GPT_4_1_20250414,
  },
  structuredOutput: {
    model: OPENAI_MODELS.GPT_4_1_MINI_20250414,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO_20250414,
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5_20250929,
  },
  structuredOutput: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5_20250929,
  },
  summarizer: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5_20250929,
  },
};

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

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;

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
    await cloneTemplate(fullTemplatePath, templateDir, contentReplacements);
    spinner.succeed(`Template "${options.template}" added to ${templateDir}`);
    return;
  }
}
