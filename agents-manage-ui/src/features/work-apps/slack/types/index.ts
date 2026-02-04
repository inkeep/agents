/**
 * Slack Work App - Frontend Type Definitions
 *
 * @module features/work-apps/slack/types
 *
 * This module defines TypeScript types for the Slack dashboard UI:
 *
 * Core Types:
 * - `SlackWorkspace` - Installed workspace data from OAuth callback
 * - `SlackNotification` - Toast notification state
 * - `SlackNotificationAction` - Notification action types for analytics
 */

/**
 * Represents an installed Slack workspace.
 *
 * This data is received from the OAuth callback and stored in local state.
 */
export interface SlackWorkspace {
  /** Whether the OAuth flow succeeded */
  ok: boolean;
  /** Slack team ID (e.g., T0AA0UWRXJS) */
  teamId?: string;
  /** Slack workspace display name */
  teamName?: string;
  /** Slack workspace domain (e.g., mycompany) */
  teamDomain?: string;
  /** Enterprise Grid ID (if applicable) */
  enterpriseId?: string;
  /** Enterprise Grid name (if applicable) */
  enterpriseName?: string;
  /** Whether this is an Enterprise Grid org-wide install */
  isEnterpriseInstall?: boolean;
  /** Bot user ID in this workspace */
  botUserId?: string;
  /** OAuth scopes granted to the bot */
  botScopes?: string;
  /** Slack user ID who installed the app */
  installerUserId?: string;
  /** ISO timestamp of installation */
  installedAt?: string;
  /** Nango connection ID for token storage */
  connectionId?: string;
  /** Error message if OAuth failed */
  error?: string;
}

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
