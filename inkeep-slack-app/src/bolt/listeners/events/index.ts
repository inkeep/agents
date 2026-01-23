// ============================================================
// src/bolt/listeners/events/index.ts
// Registers all event handlers
// ============================================================

import type { App } from '@slack/bolt';

import { registerAppHomeOpenedEvent } from './app-home-opened';
import { registerAppMentionEvent } from './app-mention';
import { registerMessageEvent } from './message';

/**
 * Register all event handlers
 */
export function registerEvents(app: App): void {
  registerAppHomeOpenedEvent(app);
  registerAppMentionEvent(app);
  registerMessageEvent(app);
}
