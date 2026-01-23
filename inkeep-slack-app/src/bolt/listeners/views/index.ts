// ============================================================
// src/bolt/listeners/views/index.ts
// Registers all view submission handlers
// ============================================================

import type { App } from '@slack/bolt';

import { registerAskModalView } from './ask-modal';

/**
 * Register all view submission and closed handlers
 */
export function registerViews(app: App): void {
  registerAskModalView(app);
}
