# Documentation

This guide covers how to write documentation for the Inkeep Agent Framework.

## Location

- **Public docs**: `/agents-docs/content/docs/` (MDX format)
- **Navigation**: Update `/agents-docs/navigation.ts` for new pages

## Development

```bash
cd agents-docs
pnpm dev    # Start documentation site (port 3000)
pnpm build  # Build for production
```

## MDX Structure

```mdx
---
title: Feature Name
description: Brief description
---

## Overview
Brief description of what the feature does and why it's useful.

## Usage
[Code examples]

## API Reference
- Method descriptions

## Examples
Practical examples
```

## Guidelines

- Use MDX format (`.mdx` extension)
- Follow existing Fumadocs patterns
- Add code examples and diagrams where helpful
- Update navigation.ts to include new pages

## See Also

- Existing docs in `agents-docs/content/docs/` for examples
- `.cursor/rules/documentation-style-guide.mdc` for detailed style guide



