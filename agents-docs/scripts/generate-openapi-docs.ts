import { glob, rm } from 'node:fs/promises';
import { generateFiles } from 'fumadocs-openapi';
import { z } from 'zod';
// @ts-expect-error -- must specify ts extension
import { TagToDescription } from '../../agents-api/src/openapi.ts';
// @ts-expect-error -- must specify ts extension
import { openapi } from '../src/lib/openapi.ts';

const OUTPUT_DIR = 'content/api-reference/(openapi)';

const TagSchema = z.array(z.enum(Object.keys(TagToDescription)));

const ignoreRoutes = new Set(['/health', '/ready', '/manage/capabilities']);

const usedTags = new Set<string>();

const TitleToIcon: Record<keyof typeof TagToDescription, string> = {
  A2A: 'LuNetwork',
  'API Keys': 'LuKeyRound',
  Agents: 'LuUser',
  'Artifact Components': 'TbInputSpark',
  Branches: 'LuGitBranch',
  Channels: 'LuHash',
  CLI: 'LuTerminal',
  Chat: 'LuMessagesSquare',
  'Context Configs': 'LuCirclePlus',
  Conversations: 'LuMessageSquare',
  Credentials: 'LuKey',
  'Credential Stores': 'LuDatabase',
  'Data Components': 'LuBlocks',
  Evaluations: 'LuFlaskConical',
  'External Agents': 'LuGlobe',
  'Function Tools': 'LuCode',
  Functions: 'LuCode2',
  GitHub: 'LuGithub',
  MCP: 'LuServer',
  'MCP Catalog': 'LuLibrary',
  OAuth: 'LuShieldCheck',
  'Project Members': 'LuUsers',
  'Project Permissions': 'LuShield',
  Projects: 'LuFolderOpen',
  Refs: 'LuLink',
  Slack: 'LuMessageCircle',
  SubAgents: 'LuSpline',
  'Third-Party MCP Servers': 'LuServerCog',
  Tools: 'LuHammer',
  Triggers: 'LuWebhook',
  'User Project Memberships': 'LuUserCheck',
  Users: 'LuUsers',
  Webhooks: 'LuWebhook',
  'Work Apps': 'LuPlug',
  Workflows: 'LuWorkflow',
  Workspaces: 'LuBuilding2',
};

async function main(): Promise<void> {
  console.log('Generating OpenAPI documentation...');
  console.time('Done in');

  for await (const file of glob(`${OUTPUT_DIR}/**/*.mdx`)) {
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
    frontmatter(_title) {
      const title = _title
        .replace('A2 A', 'A2A')
        .replace('A P I', 'API')
        .replace('C L I', 'CLI')
        .replace('Git Hub', 'GitHub')
        .replace('O Auth', 'OAuth')
        .replace('Sub Agents', 'SubAgents')
        .replace('Third Party', 'Third-Party')
        .replace('M C P', 'MCP') as keyof typeof TagToDescription;
      const icon = Object.hasOwn(TitleToIcon, title) ? TitleToIcon[title] : null;

      if (!icon) {
        throw new Error(`Unknown icon for tag "${title}"`);
      }

      return {
        title,
        icon,
      };
    },
  });

  console.timeEnd('Done in');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
