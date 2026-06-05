---
"@inkeep/agents-api": patch
---

Make transient external-file download failures and unsupported-MIME errors non-fatal in the chat-message upload pipeline. A single 404, timeout, DNS failure, or `image/gif`-bytes detection on one inline image no longer aborts the entire chat request — the affected file is logged and dropped via the existing worker-drop path; remaining files and the message continue through. Real security guards (private-IP/SSRF, embedded credentials, disallowed schemes/ports) remain fatal. Internal imports updated to consume `downloadExternalFile`, the error taxonomy, and `text-document-attachments` from their new `@inkeep/agents-core/external-fetch` and `@inkeep/agents-core/text-attachments` subpaths.
