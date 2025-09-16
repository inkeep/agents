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

  private loadTemplates(): void {
    if (this.loaded) return;

    try {
      // Delegate template loading to the version config
      const loadedTemplates = this.versionConfig.loadTemplates();

      // Copy templates to our internal map
      for (const [name, content] of loadedTemplates) {
        this.templates.set(name, content);
      }

      this.loaded = true;
      logger.debug(
        { templateCount: this.templates.size, version: this.version },
        `Loaded ${this.templates.size} templates for version ${this.version}`
      );
    } catch (error) {
      logger.error({ error }, `Failed to load templates for version ${this.version}`);
      throw new Error(`Template loading failed: ${error}`);
    }
  }

  public buildSystemPrompt(config: TConfig): string {
    this.loadTemplates();

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
