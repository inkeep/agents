import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../logger';
import type { VersionConfig } from './types';

const logger = getLogger('SystemPromptBuilder');

export class SystemPromptBuilder<TConfig> {
  private templates = new Map<string, string>();
  private loaded = false;

  constructor(
    private version: string,
    private versionConfig: VersionConfig<TConfig>
  ) {}

  private async loadTemplates(): Promise<void> {
    if (this.loaded) return;

    try {
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const templatesDir = join(currentDir, '..', '..', 'templates', this.version);

      // Load all required template files for this version
      const templatePromises = this.versionConfig.templateFiles.map(async (filename) => {
        const filePath = join(templatesDir, filename);
        const content = await readFile(filePath, 'utf-8');
        const templateName = filename.replace('.xml', ''); // Remove extension for key
        return [templateName, content] as const;
      });

      const templateEntries = await Promise.all(templatePromises);

      for (const [name, content] of templateEntries) {
        this.templates.set(name, content);
      }

      this.loaded = true;
      logger.debug(`Loaded ${this.templates.size} templates for version ${this.version}`);
    } catch (error) {
      logger.error({ error }, `Failed to load templates for version ${this.version}`);
      throw new Error(`Template loading failed: ${error}`);
    }
  }

  public async buildSystemPrompt(config: TConfig): Promise<string> {
    await this.loadTemplates();

    // Validate that all required template variables are present
    this.validateTemplateVariables(config);

    // Let the version config handle assembly
    return this.versionConfig.assemble(this.templates, config);
  }

  private validateTemplateVariables(config: TConfig): void {
    if (!config) {
      throw new Error('Configuration object is required');
    }

    // Basic validation - version configs can add their own validation
    if (typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }
  }

  public getLoadedTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  public isLoaded(): boolean {
    return this.loaded;
  }
}
