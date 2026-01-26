import { generateFiles, type OperationOutput } from 'fumadocs-openapi';
// @ts-expect-error -- must specify ts extension
import { openapi } from '../src/lib/openapi.ts';
// @ts-expect-error -- must specify ts extension
import { TagToDescription } from '../../agents-api/src/openapi.ts';
import { rm, glob } from 'node:fs/promises';

const OUTPUT_DIR = './content/api-reference';

async function main(): Promise<void> {
  console.log('Generating OpenAPI documentation...');
  console.time('Done in');

  for await (const file of glob('content/api-reference/**/*.mdx')) {
    await rm(file);
  }

  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: 'custom',
    // per: 'operation',
    // groupBy: 'tag',
    toPages(builder) {
      const { operations } = builder.extract();
      for (const op of operations) {
        // biome-ignore lint/style/noNonNullAssertion: ignore
        const { operation, displayName } = builder.fromExtractedOperation(op)!;
        // @ts-expect-error -- wrong type
        const tags = operation.tags;
        const hasValidTags = Array.isArray(tags) && tags.length === 1;
        if (!hasValidTags) {
          // throw new Error(
          //   `Tags must be an array and contains 1 item, received: ${JSON.stringify(tags)}`
          // );
        }
        // const [tag] = tags
        const path = tags?.[0] ?? 'unknown';
        const entry: OperationOutput = {
          type: 'operation',
          schemaId: builder.id,
          item: op,
          path: `${path}.mdx`,
          info: {
            title: displayName,
            // @ts-expect-error -- wrong type
            description: operation.description,
          },
        };
        builder.create(entry);
      }
    },
    includeDescription: true,
  });

  console.timeEnd('Done in');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
