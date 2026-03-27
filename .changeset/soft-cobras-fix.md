---
'@inkeep/agents-api': patch
---

Add inline text document attachments to the run chat APIs for `text/plain`, `text/markdown`, `text/html`, `text/csv`, `text/x-log`, and `application/json` while keeping remote URLs limited to PDFs. Persist text attachments as blob-backed file parts and replay them into model input as XML-tagged text blocks.
