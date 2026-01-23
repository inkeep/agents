// ============================================================
// src/bolt/listeners/actions/index.ts
// Registers all block action handlers
// ============================================================

import type { App } from '@slack/bolt';
import { registerAskActions } from './ask';
import { registerAuthActions } from './auth';
import { registerConfigActions } from './config';
import { registerFeedbackActions } from './feedback';

// Register all block action handlers

// IMPORTANT: Do NOT add catch-all handlers like:
//   app.action(/.*/, async ({ ack }) => { await ack(); });
// This causes "ack already called" errors because Bolt will
//  match the same action against multiple handlers.
// Only register handlers for specific action_ids.

export function registerActions(app: App): void {
  registerAuthActions(app);
  registerAskActions(app);
  registerConfigActions(app);
  registerFeedbackActions(app);
}
