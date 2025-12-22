import { Command as CommanderCommand } from 'commander';
import type { Command, ParentCommand, Option, Argument } from './types.js';
import { isParentCommand } from './types.js';

/**
 * Build a Commander option from schema definition
 */
function addOption(cmd: CommanderCommand, opt: Option): void {
  const method = opt.required ? 'requiredOption' : 'option';

  if (opt.defaultValue !== undefined && opt.defaultValue !== null) {
    // Commander expects string | boolean | string[] for default values
    const defaultVal = opt.defaultValue as string | boolean | string[];
    cmd[method](opt.flags, opt.description, defaultVal);
  } else {
    cmd[method](opt.flags, opt.description);
  }
}

/**
 * Build a Commander argument from schema definition
 */
function addArgument(cmd: CommanderCommand, arg: Argument): void {
  let syntax: string;

  if (arg.variadic) {
    syntax = arg.required ? `<${arg.name}...>` : `[${arg.name}...]`;
  } else {
    syntax = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
  }

  if (arg.defaultValue !== undefined) {
    cmd.argument(syntax, arg.description, arg.defaultValue);
  } else {
    cmd.argument(syntax, arg.description);
  }
}

/**
 * Build a single Commander command from schema
 */
export function buildCommand<T = Record<string, unknown>>(
  schema: Command,
  action: (options: T) => Promise<void>
): CommanderCommand {
  const cmd = new CommanderCommand(schema.name);

  cmd.description(schema.description);

  // Add positional arguments
  for (const arg of schema.arguments ?? []) {
    addArgument(cmd, arg);
  }

  // Add options/flags
  for (const opt of schema.options ?? []) {
    addOption(cmd, opt);
  }

  // Add aliases
  for (const alias of schema.aliases ?? []) {
    cmd.alias(alias);
  }

  // Set action handler with proper argument extraction
  const argCount = schema.arguments?.length ?? 0;
  cmd.action(async (...args: unknown[]) => {
    // Commander passes positional args first, then options object, then command
    const positionalArgs = args.slice(0, argCount);
    const options = (args[argCount] ?? {}) as Record<string, unknown>;

    // Merge positional args into options using argument names
    const merged: Record<string, unknown> = { ...options };
    (schema.arguments ?? []).forEach((arg, index) => {
      if (positionalArgs[index] !== undefined) {
        merged[arg.name] = positionalArgs[index];
      }
    });

    await action(merged as T);
  });

  // Hide from help if marked hidden
  if (schema.hidden) {
    // Commander v14 uses hideHelp() or hide() - check which is available
    if (typeof (cmd as unknown as { hide: () => void }).hide === 'function') {
      (cmd as unknown as { hide: () => void }).hide();
    }
  }

  return cmd;
}

/**
 * Build a parent command with subcommands from schema
 */
export function buildParentCommand<T extends Record<string, (...args: unknown[]) => Promise<void>>>(
  schema: ParentCommand,
  subcommandActions: T
): CommanderCommand {
  const parentCmd = new CommanderCommand(schema.name);
  parentCmd.description(schema.description);

  // Add parent-level options if any
  for (const opt of schema.options ?? []) {
    addOption(parentCmd, opt);
  }

  // Add each subcommand
  for (const [subName, subSchema] of Object.entries(schema.subcommands)) {
    const action = subcommandActions[subName];
    if (!action) {
      throw new Error(`Missing action for subcommand: ${schema.name} ${subName}`);
    }

    // Build subcommand with its own action handler
    const subCmd = new CommanderCommand(subSchema.name);
    subCmd.description(subSchema.description);

    // Add subcommand arguments
    for (const arg of subSchema.arguments ?? []) {
      addArgument(subCmd, arg);
    }

    // Add subcommand options
    for (const opt of subSchema.options ?? []) {
      addOption(subCmd, opt);
    }

    // Set action - extract positional args for subcommand
    const argCount = subSchema.arguments?.length ?? 0;
    subCmd.action(async (...args: unknown[]) => {
      const positionalArgs = args.slice(0, argCount);
      const options = (args[argCount] ?? {}) as Record<string, unknown>;

      // Merge positional args into options
      const merged: Record<string, unknown> = { ...options };
      (subSchema.arguments ?? []).forEach((arg, index) => {
        if (positionalArgs[index] !== undefined) {
          merged[arg.name] = positionalArgs[index];
        }
      });

      // Call action with first positional arg (for simple cases like profile add [name])
      // and the full merged options
      if (argCount > 0) {
        await action(positionalArgs[0], merged);
      } else {
        await action(merged);
      }
    });

    parentCmd.addCommand(subCmd);
  }

  return parentCmd;
}

/**
 * Register a command on the main program
 */
export function registerCommand<T = Record<string, unknown>>(
  program: CommanderCommand,
  schema: Command,
  action: (options: T) => Promise<void>
): void {
  const cmd = buildCommand(schema, action);
  program.addCommand(cmd);
}

/**
 * Register a parent command with subcommands on the main program
 */
export function registerParentCommand<T extends Record<string, (...args: unknown[]) => Promise<void>>>(
  program: CommanderCommand,
  schema: ParentCommand,
  subcommandActions: T
): void {
  const cmd = buildParentCommand(schema, subcommandActions);
  program.addCommand(cmd);
}
