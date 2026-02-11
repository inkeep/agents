/**
 * Slack Work App - Frontend Type Definitions
 *
 * @module features/work-apps/slack/types
 *
 * This module defines TypeScript types for the Slack dashboard UI:
 *
 * Core Types:
 * - `SlackNotification` - Toast notification state
 * - `SlackNotificationAction` - Notification action types for analytics
 */

/**
 * Notification action types for tracking and analytics.
 */
export type SlackNotificationAction =
  | 'connected'
  | 'disconnected'
  | 'installed'
  | 'error'
  | 'info'
  | 'cancelled';

/**
 * Toast notification state for the dashboard.
 */
export interface SlackNotification {
  /** Visual style: success (green), error (red), info (blue) */
  type: 'success' | 'error' | 'info';
  /** Human-readable message to display */
  message: string;
  /** Action type for analytics tracking */
  action?: SlackNotificationAction;
}
