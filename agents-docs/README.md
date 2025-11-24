# @inkeep/agents-docs

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
pnpm dev
```

Open http://localhost:3010 with your browser to see the result.

## Explore

In the project, you can see:

- [`src/lib/source.ts`](./src/lib/source.ts): Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- [`src/app/[[...slug]]/page.tsx`](./src/app/[[...slug]]/page.tsx): Shared options for layouts, optional but preferred to keep.

### Fumadocs MDX

A [`source.config.ts`](./source.config.ts) config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.vercel.app) - learn about Fumadocs
