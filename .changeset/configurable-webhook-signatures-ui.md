---
"@inkeep/agents-manage-ui": minor
---

Add UI for configurable webhook signature verification

Added comprehensive UI for configuring webhook signature verification with support for GitHub, Slack, Stripe, Zendesk, and custom webhook providers.

**New Features:**

- Replaced plaintext signing secret input with credential reference selector
- Added algorithm selector (sha256, sha512, sha384, sha1, md5) with deprecation warnings
- Added encoding selector (hex, base64)
- Added signature location configuration (header, query, body with JMESPath)
- Added signed components builder with reordering, add/remove functionality
- Added component join configuration (strategy and separator)
- Added quick setup presets for GitHub, Slack, Zendesk, and Stripe
- Added advanced validation options (case sensitivity, empty body, Unicode normalization)
- Added client-side JMESPath and regex validation with error messages
- All new fields integrate with existing trigger form validation and submission

**UI Improvements:**

- Collapsible "Advanced Validation Options" section reduces visual clutter
- Provider preset buttons enable one-click configuration for common webhooks
- Dynamic field labels and placeholders based on selected options
- Helpful tooltips and FormDescription text throughout
- Reorder buttons (up/down arrows) for signed components
- Success toast confirmation when applying presets
