# PR Body Templates

Markdown templates for enriching PR descriptions with screenshots and preview links.

## Template 1: Visual Changes (Before/After)

Use for PRs that change UI appearance or behavior.

```markdown
### Visual Changes

| Before | After |
|--------|-------|
| ![Before - {page name}]({before-image-url}) | ![After - {page name}]({after-image-url}) |

> Screenshots captured from {environment}
```

## Template 2: Visual Changes (Side-by-Side Comparison)

Use when the before/after comparison is generated as a single stitched image.

```markdown
### Visual Changes

![{page name} - Before vs After]({comparison-image-url})
```

## Template 3: Test URLs

Include links to preview deployment pages for manual testing.

```markdown
### Test URLs

Test these pages on the preview deployment:

- [{Page name}]({preview-url}/{route}) — {what to verify}
- [{Page name}]({preview-url}/{route}) — {what to verify}
```

## Template 4: Combined (Recommended)

Full PR body template with all sections.

```markdown
### Changes

- {Change 1}
- {Change 2}
- {Change 3}

### Visual Changes

| Before | After |
|--------|-------|
| ![Before - {page}]({url}) | ![After - {page}]({url}) |

### Test URLs

- [{Page name}]({preview-url}) — {what to test}
- [{Page name}]({preview-url}) — {what to test}

### Test Plan

- [ ] {Test case 1}
- [ ] {Test case 2}
```

## Template 5: Video Demo

Use when a screen recording is more appropriate than static screenshots (e.g., interaction flows, animations, drag-and-drop behavior).

```markdown
### Demo

<details>
<summary>Screen recording</summary>

https://github.com/user-attachments/assets/{video-id}

</details>
```

To upload a video:
1. Record with QuickTime or `screencapture -v recording.mov` (macOS)
2. Drag the `.mov` file into the GitHub PR comment editor
3. GitHub generates a permanent URL automatically

## Template 6: Multiple Pages Affected

Use when a change affects several different pages.

```markdown
### Visual Changes

#### {Page 1 name}
| Before | After |
|--------|-------|
| ![Before]({url}) | ![After]({url}) |

#### {Page 2 name}
| Before | After |
|--------|-------|
| ![Before]({url}) | ![After]({url}) |

### Test URLs

| Page | URL | What to verify |
|------|-----|----------------|
| {Page 1} | [{link text}]({url}) | {verification steps} |
| {Page 2} | [{link text}]({url}) | {verification steps} |
```

## Image Upload Methods

### Method A: Bunny Edge Storage (recommended)

Programmatic upload with permanent CDN URLs. Best for automated workflows.

```javascript
const helpers = require('./lib/helpers');
const result = await helpers.uploadToBunnyStorage(
  './tmp/screengrabs/dashboard-labeled.png',
  `pr-${prNumber}/dashboard-before.png`
);
// result.url → "https://{cdn-hostname}/pr-123/dashboard-before.png"
```

Requires `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_HOSTNAME` env vars.

### Method B: Drag and drop

1. Edit the PR description on GitHub
2. Drag a PNG/GIF/MOV file into the text area
3. GitHub uploads it and inserts a markdown image link
4. Save

### Method C: gh CLI comment

```bash
# Post a comment with an image reference
gh pr comment {pr-number} --body "### Screenshot
![Description](image-url)"
```

### Method D: Update PR body programmatically

```bash
# Read current PR body, append visual changes section
CURRENT_BODY=$(gh pr view {pr-number} --json body -q '.body')
NEW_BODY="${CURRENT_BODY}

### Visual Changes
| Before | After |
|--------|-------|
| ![Before](url1) | ![After](url2) |"

gh pr edit {pr-number} --body "$NEW_BODY"
```

## Notes

- Bunny Storage URLs are permanent and served via CDN — no expiration
- GitHub image URLs from drag-and-drop are also permanent CDN links
- GitHub supports PNG, GIF, JPG, and MOV/MP4 uploads
- Maximum file size: 10MB for images, 100MB for videos (on paid plans)
- Always add descriptive alt text for accessibility
- Use `<details>` tags for large images or videos to keep the PR body scannable
