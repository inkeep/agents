/**
 * Single source of truth for the Support Copilot platform catalog.
 *
 * Consumed by:
 *   - the `SupportCopilotPlatformSchema` enum in validation/schemas.ts
 *   - the Manage UI dropdown (labels only)
 *   - the `GET /credential-gateway/.well-known/platforms` discovery endpoint
 *     (served to browser extensions so they can detect the current tab's platform)
 *
 * When a new platform is added here, everything else picks it up:
 *   - server-side `audience` validation accepts the new slug,
 *   - the manage UI dropdown gets the new option on next rebuild,
 *   - extensions get the new matcher on their next catalog fetch.
 */

export interface SupportCopilotPageMatcher {
  /** Stable identifier for this page variant. Used by the extension for analytics
   *  and UI branching (ticket view vs. customer view vs. etc.). */
  pageType: string;
  /** Exact host (e.g., "secure.helpscout.net") or subdomain glob (e.g., "*.zendesk.com"). */
  hostGlob: string;
  /** Regex source applied to URL.pathname. Capture groups MUST be named via
   *  `(?<name>...)` — the extension reads them from `RegExp.exec(path)?.groups`.
   *  Named groups keep the names and the pattern in a single source of truth,
   *  so there's nothing for a separate `captures` array to go out-of-sync with. */
  pathPattern: string;
}

export interface SupportCopilotPlatformEntry {
  /** Stable slug. Also the `audience` value sent to /credential-gateway/token. */
  slug: string;
  /** Human-readable label for the Manage UI dropdown. */
  label: string;
  /** URL matchers for the extension. Evaluated in order; first match wins. */
  pageMatchers: SupportCopilotPageMatcher[];
  /** Whether configuring this platform requires selecting a credential reference.
   *  True for platforms where the copilot relies on the credential gateway
   *  (Chrome extension flow). False for platforms where the copilot runs inside
   *  the host app's own iframe and receives auth from the host (e.g., Zendesk ZAF). */
  credentialRequired: boolean;
}

/**
 * Ordered alphabetically by label for deterministic UI rendering.
 */
export const SUPPORT_COPILOT_PLATFORMS = [
  {
    slug: 'atlas',
    label: 'Atlas',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'atlas_conversation',
        hostGlob: 'app.atlas.so',
        pathPattern: '^/conversations/(?<ticketId>[a-zA-Z0-9-]+)',
      },
    ],
  },
  {
    slug: 'freshdesk',
    label: 'Freshdesk',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'freshdesk_ticket',
        hostGlob: '*.freshdesk.com',
        pathPattern: '^/a/tickets/(?<ticketId>\\d+)',
      },
    ],
  },
  {
    slug: 'front',
    label: 'Front',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'front_conversation',
        hostGlob: 'app.frontapp.com',
        pathPattern: '^/inbox/.+/open/(?<ticketId>[a-z0-9]+)',
      },
    ],
  },
  {
    slug: 'github',
    label: 'GitHub',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'github_issue',
        hostGlob: 'github.com',
        pathPattern: '^/[^/]+/[^/]+/issues/(?<ticketId>\\d+)',
      },
    ],
  },
  {
    slug: 'helpscout',
    label: 'Help Scout',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'helpscout_conversation',
        hostGlob: 'secure.helpscout.net',
        pathPattern: '^/conversation/(?<ticketId>\\d+)',
      },
    ],
  },
  {
    slug: 'intercom',
    label: 'Intercom',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'intercom_conversation',
        hostGlob: 'app.intercom.com',
        pathPattern: '^/a/inbox/.+/conversation/(?<ticketId>\\d+)',
      },
    ],
  },
  {
    slug: 'jira',
    label: 'Jira',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'jira_issue',
        hostGlob: '*.atlassian.net',
        pathPattern: '^/browse/(?<ticketId>[A-Z]+-\\d+)',
      },
    ],
  },
  {
    slug: 'missive',
    label: 'Missive',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'missive_conversation',
        hostGlob: 'mail.missiveapp.com',
        pathPattern: '^/(?<ticketId>[a-f0-9-]+)',
      },
    ],
  },
  {
    slug: 'plain',
    label: 'Plain',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'plain_thread',
        hostGlob: 'app.plain.com',
        pathPattern: '^/thread/(?<ticketId>[a-zA-Z0-9-]+)',
      },
    ],
  },
  {
    slug: 'salesforce',
    label: 'Salesforce',
    credentialRequired: true,
    pageMatchers: [
      {
        pageType: 'salesforce_case',
        hostGlob: '*.lightning.force.com',
        pathPattern: '^/lightning/r/Case/(?<ticketId>[a-zA-Z0-9]+)',
      },
    ],
  },
  {
    slug: 'zendesk',
    label: 'Zendesk',
    credentialRequired: false,
    pageMatchers: [
      {
        pageType: 'zendesk_ticket',
        hostGlob: '*.zendesk.com',
        pathPattern: '^/agent/tickets/(?<ticketId>\\d+)',
      },
    ],
  },
] as const satisfies readonly SupportCopilotPlatformEntry[];

export type SupportCopilotPlatformSlug = (typeof SUPPORT_COPILOT_PLATFORMS)[number]['slug'];

export const SUPPORT_COPILOT_PLATFORM_SLUGS = SUPPORT_COPILOT_PLATFORMS.map(
  (p) => p.slug
) as SupportCopilotPlatformSlug[];
