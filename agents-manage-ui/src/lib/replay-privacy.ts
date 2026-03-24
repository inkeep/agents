/**
 * Shared selectors for session replay privacy configuration.
 *
 * Both Sentry and PostHog session replays mask all text by default.
 * These selectors identify static UI chrome (navigation, buttons, labels, etc.)
 * that is safe to unmask because it doesn't contain user-generated PII.
 *
 * Sentry uses these as the `unmask` array in `replayIntegration()`.
 * PostHog uses these joined into a single selector for `element.closest()` in `maskTextFn`.
 */

/** CSS selectors for static UI elements that are safe to show in session replays. */
export const REPLAY_UNMASK_SELECTORS = [
  // Sidebar navigation (menu items, group labels, header, footer)
  '[data-slot="sidebar"]',
  // Buttons
  '[data-slot="button"]',
  // Tabs
  '[role="tab"]',
  '[role="tablist"]',
  // Breadcrumbs
  'nav[aria-label="Breadcrumb"]',
  // Headings (page titles, section headers)
  'h1',
  'h2',
  'h3',
  'h4',
  // Table headers
  'thead',
  'th',
  // Form labels (not form values)
  'label',
  // Dropdown menus, select options, tooltips
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="tooltip"]',
  // Dialog/sheet titles
  '[role="dialog"]',
  '[role="alertdialog"]',
] as const;

/** Pre-joined selector string for use with `element.closest()`. */
export const REPLAY_UNMASK_SELECTOR_STRING = REPLAY_UNMASK_SELECTORS.join(', ');

/** CSS selectors for media elements (SVG icons) that are safe to unblock in Sentry replays. */
export const REPLAY_UNBLOCK_SELECTORS = [
  '[data-slot="sidebar"] svg',
  '[data-slot="button"] svg',
  'nav svg',
] as const;
