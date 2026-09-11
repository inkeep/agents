---
"@inkeep/agents-core": patch
---

Fix invitation links failing with "Email verification required" for SSO and email/password invitees after the better-auth 1.6.11 upgrade, by setting `requireEmailVerificationOnInvitation: false` on the organization plugin. This restores the pre-1.6.11 behavior in which a session whose email matches a pending invitation can read, list, accept, or reject that invitation without the session email being verified (GHSA-fmh4-wcc4-5jm3).
