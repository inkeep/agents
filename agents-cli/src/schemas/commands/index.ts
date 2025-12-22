/**
 * Command Schemas Index
 *
 * This file exports all CLI command schemas. These schemas are the single source of truth
 * for both Commander.js CLI definitions and MDX documentation generation.
 */

// Re-export types for consumers
export type { Command, ParentCommand, Option, Argument, Example } from '../types.js';
export { isParentCommand } from '../types.js';

// Simple commands
export { addCommand, addOptionsSchema, type AddOptions } from './add.schema.js';
export { devCommand, devOptionsSchema, type DevOptions } from './dev.schema.js';
export { initCommand, initOptionsSchema, type InitOptions } from './init.schema.js';
export {
  listAgentsCommand,
  listAgentsOptionsSchema,
  type ListAgentsOptions,
} from './list-agents.schema.js';
export { loginCommand, loginOptionsSchema, type LoginOptions } from './login.schema.js';
export { logoutCommand, logoutOptionsSchema, type LogoutOptions } from './logout.schema.js';
export { pullCommand, pullOptionsSchema, type PullOptions } from './pull.schema.js';
export { pushCommand, pushOptionsSchema, type PushOptions } from './push.schema.js';
export { statusCommand, statusOptionsSchema, type StatusOptions } from './status.schema.js';
export { updateCommand, updateOptionsSchema, type UpdateOptions } from './update.schema.js';
export { whoamiCommand, whoamiOptionsSchema, type WhoamiOptions } from './whoami.schema.js';

// Parent commands with subcommands
export {
  configCommand,
  configGetOptionsSchema,
  configListOptionsSchema,
  configSetOptionsSchema,
  type ConfigGetOptions,
  type ConfigListOptions,
  type ConfigSetOptions,
} from './config.schema.js';
export {
  profileCommand,
  profileAddOptionsSchema,
  profileRemoveOptionsSchema,
  profileUseOptionsSchema,
  type ProfileAddOptions,
  type ProfileRemoveOptions,
  type ProfileUseOptions,
} from './profile.schema.js';

/**
 * All command schemas for iteration (useful for doc generation)
 */
import { addCommand } from './add.schema.js';
import { configCommand } from './config.schema.js';
import { devCommand } from './dev.schema.js';
import { initCommand } from './init.schema.js';
import { listAgentsCommand } from './list-agents.schema.js';
import { loginCommand } from './login.schema.js';
import { logoutCommand } from './logout.schema.js';
import { profileCommand } from './profile.schema.js';
import { pullCommand } from './pull.schema.js';
import { pushCommand } from './push.schema.js';
import { statusCommand } from './status.schema.js';
import { updateCommand } from './update.schema.js';
import { whoamiCommand } from './whoami.schema.js';

import type { Command, ParentCommand } from '../types.js';

export const allCommands: (Command | ParentCommand)[] = [
  addCommand,
  configCommand,
  devCommand,
  initCommand,
  listAgentsCommand,
  loginCommand,
  logoutCommand,
  profileCommand,
  pullCommand,
  pushCommand,
  statusCommand,
  updateCommand,
  whoamiCommand,
];
