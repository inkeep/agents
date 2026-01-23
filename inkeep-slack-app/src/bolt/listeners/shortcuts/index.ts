// ============================================================
// src/bolt/listeners/shortcuts/index.ts
// Registers all shortcut handlers
// ============================================================

import type { App } from '@slack/bolt';

import { registerAskInkeepShortcut } from './ask-inkeep';

/**
 * Register all shortcut handlers (global and message shortcuts)
 */
export function registerShortcuts(app: App): void {
  registerAskInkeepShortcut(app);
}
