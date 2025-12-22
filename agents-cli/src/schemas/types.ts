import { z } from 'zod';

/**
 * Option type enumeration for CLI flags
 */
export type OptionType = 'string' | 'boolean' | 'number';

/**
 * Single option/flag definition for a command
 */
export interface Option {
  /** Option name (camelCase, used as property name) */
  name: string;
  /** Commander.js flag syntax, e.g., '--project <project-id>' or '--verbose' */
  flags: string;
  /** Human-readable description shown in help */
  description: string;
  /** Value type (default: 'string') */
  type?: OptionType;
  /** Whether the option is required (default: false) */
  required?: boolean;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Whether this option is deprecated (default: false) */
  deprecated?: boolean;
  /** Deprecation message to show */
  deprecatedMessage?: string;
  /** Associated environment variable (for documentation) */
  envVar?: string;
}

/**
 * Positional argument definition
 */
export interface Argument {
  /** Argument name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether the argument is required (default: false) */
  required?: boolean;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Whether this accepts multiple values (args...) (default: false) */
  variadic?: boolean;
}

/**
 * Command usage example
 */
export interface Example {
  /** Description of what this example demonstrates */
  description: string;
  /** The command to run */
  command: string;
  /** Optional expected output */
  output?: string;
}

/**
 * Base command schema for standalone commands
 */
export interface Command {
  /** Command name (used in CLI, e.g., 'push') */
  name: string;
  /** Brief description shown in help listing */
  description: string;
  /** Extended description for detailed help */
  longDescription?: string;
  /** Positional arguments (default: []) */
  arguments?: Argument[];
  /** Named options/flags (default: []) */
  options?: Option[];
  /** Usage examples (default: []) */
  examples?: Example[];
  /** Command aliases (default: []) */
  aliases?: string[];
  /** Whether to hide from help listing (default: false) */
  hidden?: boolean;
  /** Whether this command is deprecated (default: false) */
  deprecated?: boolean;
  /** Deprecation message */
  deprecatedMessage?: string;
  /** Version when this command was introduced */
  since?: string;
  /** Related commands (for documentation) (default: []) */
  seeAlso?: string[];
}

/**
 * Parent command with subcommands (e.g., 'config get', 'profile list')
 */
export interface ParentCommand extends Command {
  /** Map of subcommand name to command schema */
  subcommands: Record<string, Command>;
}

/**
 * Type guard to check if a command has subcommands
 */
export function isParentCommand(cmd: Command | ParentCommand): cmd is ParentCommand {
  return 'subcommands' in cmd && cmd.subcommands !== undefined && Object.keys(cmd.subcommands).length > 0;
}

// Zod schemas for runtime validation (optional, can be used for validation)
export const OptionTypeSchema = z.enum(['string', 'boolean', 'number']);

export const OptionSchema = z.object({
  name: z.string(),
  flags: z.string(),
  description: z.string(),
  type: OptionTypeSchema.optional().default('string'),
  required: z.boolean().optional().default(false),
  defaultValue: z.any().optional(),
  deprecated: z.boolean().optional().default(false),
  deprecatedMessage: z.string().optional(),
  envVar: z.string().optional(),
}) satisfies z.ZodType<Option>;

export const ArgumentSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional().default(false),
  defaultValue: z.any().optional(),
  variadic: z.boolean().optional().default(false),
}) satisfies z.ZodType<Argument>;

export const ExampleSchema = z.object({
  description: z.string(),
  command: z.string(),
  output: z.string().optional(),
}) satisfies z.ZodType<Example>;

export const CommandSchema: z.ZodType<Command> = z.object({
  name: z.string(),
  description: z.string(),
  longDescription: z.string().optional(),
  arguments: z.array(ArgumentSchema).optional().default([]),
  options: z.array(OptionSchema).optional().default([]),
  examples: z.array(ExampleSchema).optional().default([]),
  aliases: z.array(z.string()).optional().default([]),
  hidden: z.boolean().optional().default(false),
  deprecated: z.boolean().optional().default(false),
  deprecatedMessage: z.string().optional(),
  since: z.string().optional(),
  seeAlso: z.array(z.string()).optional().default([]),
});
