import { generateFiles } from 'fumadocs-openapi';
// @ts-expect-error -- must specify ts extension
import { openapi } from '../src/lib/openapi.ts';
// @ts-expect-error -- must specify ts extension
import { TagToDescription } from '../../agents-api/src/openapi.ts';
import { rm, glob } from 'node:fs/promises';
import { z } from 'zod';

const OUTPUT_DIR = './content/api-reference';

const TagSchema = z.array(z.enum(Object.keys(TagToDescription)));

async function main(): Promise<void> {
  console.log('Generating OpenAPI documentation...');
  console.time('Done in');

  for await (const file of glob('content/api-reference/**/*.mdx')) {
    await rm(file);
  }

  const ignoreRoutes = new Set(['/manage/capabilities', '/health']);

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
        const { error } = TagSchema.safeParse(operation.tags);
        if (error) {
          const prettyError = z.prettifyError(error);
          throw new Error(`Error parsing "[${op.method.toUpperCase()}] ${op.path}":

${prettyError}`);
        }
      }
    },
  });

  // Generate
  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: 'tag',
  });

  console.timeEnd('Done in');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
