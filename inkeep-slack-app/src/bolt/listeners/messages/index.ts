// ============================================================
// src/bolt/listeners/messages/index.ts
// Message pattern listeners
//
// Note: DM thread handling is done via the 'message' event in events/message.ts
// This file is for pattern-based message matching (app.message(/pattern/, ...))
// ============================================================

import type { App } from '@slack/bolt';

import { registerDmHandler } from './dm';

/**
 * Register all message pattern handlers
 */
export function registerMessages(app: App): void {
  registerDmHandler(app);
}
