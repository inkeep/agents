import { glob, rm } from 'node:fs/promises';
import { generateFiles } from 'fumadocs-openapi';
import { z } from 'zod';
// @ts-expect-error -- must specify ts extension
import { TagToDescription } from '../../agents-api/src/openapi.ts';
// @ts-expect-error -- must specify ts extension
import { openapi } from '../src/lib/openapi.ts';

const OUTPUT_DIR = './content/api-reference';

const TagSchema = z.array(z.enum(Object.keys(TagToDescription)));

const ignoreRoutes = new Set(['/health', '/ready', '/manage/capabilities']);

const usedTags = new Set<string>();

async function main(): Promise<void> {
  console.log('Generating OpenAPI documentation...');
  console.time('Done in');

  for await (const file of glob('content/api-reference/**/*.mdx')) {
    await rm(file);
  }

  // Validate
  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: 'custom',
    toPages(builder) {
      const { operations } = builder.extract();
      for (const op of operations) {
        if (ignoreRoutes.has(op.path)) {
          continue;
        }
        // biome-ignore lint/style/noNonNullAssertion: ignore
        const { operation } = builder.fromExtractedOperation(op)!;
        // @ts-expect-error -- wrong type
        const tags = operation.tags as string[];
        const { error } = TagSchema.safeParse(tags);
        if (error) {
          const prettyError = z.prettifyError(error);
          throw new Error(`Error parsing tags ${JSON.stringify(tags)} "[${op.method.toUpperCase()}] ${op.path}":

${prettyError}`);
        }
        for (const tag of tags) {
          usedTags.add(tag);
        }
      }
    },
  });

  for (const tag of Object.keys(TagToDescription)) {
    if (!usedTags.has(tag)) {
      throw new Error(`Tag "${tag}" is unused and should be removed.`);
    }
  }

  // Generate
  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: 'tag',
    // Fumadocs splits uppercase acronyms into spaced letters (e.g. "A P I").
    // This normalizes common cases back to their proper titles.
    frontmatter(title) {
      return {
        title: title
          .replace('A2 A', 'A2A')
          .replace('A P I', 'API')
          .replace('C L I', 'CLI')
          .replace('O Auth', 'OAuth')
          .replace('M C P', 'MCP'),
      };
    },
  });

  console.timeEnd('Done in');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
