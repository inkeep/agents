// ============================================================
// src/bolt/listeners/commands/index.ts
// Registers all slash commands
// ============================================================

import type { App } from '@slack/bolt';

import { registerInkeepCommand } from './inkeep';

/**
 * Register all slash commands
 */
export function registerCommands(app: App): void {
  registerInkeepCommand(app);
}
