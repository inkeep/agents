import chalk from 'chalk';

/**
 * Output modes for the CLI
 */
export enum OutputMode {
  /**
   * Normal mode with colors and formatting
   */
  NORMAL = 'normal',
  /**
   * JSON output mode for machine-readable output
   */
  JSON = 'json',
  /**
   * Quiet mode with minimal output
   */
  QUIET = 'quiet',
}

/**
 * Service for handling console output with consistent styling
 *
 * This service abstracts all console output and provides a consistent
 * interface for displaying messages with different styles and colors.
 * It supports different output modes (normal, JSON, quiet) for flexibility.
 */
export class OutputService {
  constructor(private mode: OutputMode = OutputMode.NORMAL) {}

  /**
   * Set the output mode
   */
  setMode(mode: OutputMode): void {
    this.mode = mode;
  }

  /**
   * Get current output mode
   */
  getMode(): OutputMode {
    return this.mode;
  }

  /**
   * Display a success message (green)
   */
  success(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(chalk.green(message));
  }

  /**
   * Display an error message (red)
   */
  error(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.error(chalk.red(message));
  }

  /**
   * Display a warning message (yellow)
   */
  warning(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(chalk.yellow(message));
  }

  /**
   * Display an info message (cyan)
   */
  info(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(chalk.cyan(message));
  }

  /**
   * Display a secondary/muted message (gray)
   */
  secondary(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(chalk.gray(message));
  }

  /**
   * Display a plain message without coloring
   */
  plain(message: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(message);
  }

  /**
   * Display an empty line
   */
  newline(): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log();
  }

  /**
   * Output JSON data
   */
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Display a labeled value (e.g., "  • Project ID: abc123")
   */
  label(label: string, value: string, color: 'success' | 'info' | 'secondary' = 'secondary'): void {
    if (this.mode === OutputMode.QUIET) return;

    const colorFn = color === 'success' ? chalk.green : color === 'info' ? chalk.cyan : chalk.gray;

    console.log(colorFn(`  • ${label}: ${value}`));
  }

  /**
   * Display a section header
   */
  section(title: string): void {
    if (this.mode === OutputMode.QUIET) return;
    console.log(chalk.cyan(`\n${title}`));
  }

  /**
   * Display a list of items with bullets
   */
  list(items: string[]): void {
    if (this.mode === OutputMode.QUIET) return;
    for (const item of items) {
      console.log(chalk.gray(`  • ${item}`));
    }
  }

  /**
   * Display a key-value pair list
   */
  keyValues(pairs: Record<string, string>): void {
    if (this.mode === OutputMode.QUIET) return;
    for (const [key, value] of Object.entries(pairs)) {
      this.label(key, value);
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const outputService = new OutputService();
