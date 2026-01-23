// ============================================================
// src/bolt/listeners/index.ts
// Main entry point - registers all Bolt listeners
// ============================================================

import type { App } from '@slack/bolt';
import { registerActions } from './actions';
import { registerCommands } from './commands';
import { registerEvents } from './events';
import { registerMessages } from './messages';
import { registerShortcuts } from './shortcuts';
import { registerViews } from './views';

/**
 * Register all Bolt listeners
 * Called from bolt/app.ts via registerListeners()
 */
export function register(app: App): void {
  registerCommands(app);
  registerEvents(app);
  registerActions(app);
  registerMessages(app);
  registerShortcuts(app);
  registerViews(app);

  console.log('✅ All Bolt listeners registered');
}
