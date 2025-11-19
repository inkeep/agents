/// <reference types="bun-types" />

import { build } from 'bun';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { packExtension } from '@anthropic-ai/mcpb';
import { join } from 'node:path';

async function buildMcpServer() {
  const entrypoint = './src/mcp-server/mcp-server.ts';
  const destinationDir = './bin';

  await build({
    entrypoints: [entrypoint],
    outdir: destinationDir,
    sourcemap: 'linked',
    target: 'node',
    format: 'esm',
    minify: false,
    throw: true,
    banner: '#!/usr/bin/env node',
  });

  // Set executable permissions on the output file
  const outputFile = join(destinationDir, 'mcp-server.js');
  await chmod(outputFile, 0o755);

  // Build the MCP bundle file
  await packExtension({
    extensionPath: '.',
    outputPath: 'mcp-server.mcpb',
    silent: false,
  });

  // Copy the MCP bundle file to `./static` to have the CloudFlare Worker serve it
  const staticDir = './static';
  await mkdir(staticDir, { recursive: true });
  await copyFile('mcp-server.mcpb', join(staticDir, 'mcp-server.mcpb'));
}

await buildMcpServer().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
