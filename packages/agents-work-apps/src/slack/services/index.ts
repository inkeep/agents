/**
 * Slack Work App - Service Layer Barrel Exports
 *
 * @module @inkeep/agents-work-apps/slack/services
 *
 * This module re-exports all Slack service functionality:
 *
 * Agent Resolution:
 * - `resolveEffectiveAgent` - Determine which agent to use (user > channel > workspace)
 * - `getAgentConfigSources` - Get all config sources for status display
 *
 * API Client:
 * - `SlackApiClient` - Internal API client for manage endpoints
 * - `createSlackApiClient` - Factory function for client creation
 * - `sendDeferredResponse` - Send delayed responses via response_url
 *
 * Auth (JWT):
 * - `getSlackUserJwt` - Generate JWT for API calls
 * - `verifySlackJwt` - Verify JWT tokens
 * - `executeAgentWithSlackJwt` - Execute agent with JWT auth
 * - `streamAgentWithSlackJwt` - Stream agent response with JWT auth
 *
 * Block Kit:
 * - All message builders: createHelpMessage, createStatusMessage, etc.
 *
 * Slack Web API:
 * - `getSlackClient` - WebClient wrapper
 * - `getSlackUserInfo`, `getSlackTeamInfo`, `getSlackChannels`
 * - `postMessage`, `postMessageInThread`
 *
 * Commands:
 * - `handleCommand` - Main slash command dispatcher
 * - Individual command handlers
 *
 * Events:
 * - `handleAppMention` - @mention event handler
 * - `streamAgentResponse` - Streaming response to Slack
 * - Modal and block action handlers
 *
 * Nango:
 * - OAuth connection management
 * - Workspace default agent retrieval
 *
 * Security:
 * - `verifySlackRequest` - HMAC signature verification
 * - Request body parsing utilities
 */

export * from './agent-resolution';
export * from './api-client';
export * from './auth';
export * from './blocks';
export * from './client';
export * from './commands';
export * from './events';
export * from './modals';
export * from './nango';
export * from './security';
export * from './types';
export * from './workspace-tokens';
