import { generateFiles } from 'fumadocs-openapi';
// @ts-expect-error -- must specify ts extension
import { openapi } from '../src/lib/openapi.ts';

const OUTPUT_DIR = './content/docs/api-reference';

async function main(): Promise<void> {
  console.log('Generating OpenAPI documentation...');
  console.time('Done in');

  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: 'file',
    includeDescription: true,
  });

  console.timeEnd('Done in');
}

main().catch(console.error);
