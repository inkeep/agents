/**
 * Slack JWT Authentication Types
 *
 * Re-exports types for Slack JWT authentication.
 * The actual JWT signing/verification is done directly via @inkeep/agents-core
 * in the command handlers and event handlers.
 */

import type { SlackAccessTokenPayload } from '@inkeep/agents-core';

export type { SlackAccessTokenPayload };
