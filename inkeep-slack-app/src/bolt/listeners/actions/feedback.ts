// ============================================================
// src/bolt/listeners/actions/feedback.ts
// Feedback action handlers
// ============================================================

import type { App } from '@slack/bolt';

export function registerFeedbackActions(app: App): void {
  // Feedback: helpful
  app.action('feedback_helpful', async ({ ack, body, logger }) => {
    await ack();

    const userId = body.user?.id;
    logger.info(`[feedback] helpful from user=${userId}`);

    // TODO: Log to analytics
  });

  // Feedback: not helpful
  app.action('feedback_not_helpful', async ({ ack, body, logger }) => {
    await ack();

    const userId = body.user?.id;
    logger.info(`[feedback] not_helpful from user=${userId}`);

    // TODO: Log to analytics
  });
}
