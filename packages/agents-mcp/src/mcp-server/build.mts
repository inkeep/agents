/// <reference types="bun-types" />

import { build } from "bun";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { packExtension } from "@anthropic-ai/mcpb";
import { join } from "node:path";
import { createMCPServer } from "./server.ts";
import { createConsoleLogger } from "./console-logger.ts";

const shouldPack = process.argv.includes("--pack");

async function buildMcpServer() {
  // Explicitly create server to register tools
  const logger = createConsoleLogger("info");
  const { tools } = createMCPServer({ logger });

  // Iterate through all registered tools and add them to the manifest
  const manifest = await readFile("manifest.json", "utf8");
  const manifestJson = JSON.parse(manifest);

  // remove previous 
  manifestJson.tools = [];
  manifestJson.tools.push(...tools.map((tool: any) => ({
    name: tool.name,
    description: tool.description,
  })));

  await writeFile("manifest.json", JSON.stringify(manifestJson, null, 2));
  const entrypoint = "./src/mcp-server/mcp-server.ts";
  const destinationDir = "./bin";

  // Generate tool-names.ts for the landing page
  const toolNamesContent = `// Auto-generated at build time
export const toolNames: Array<{ name: string; description: string }>= ${JSON.stringify(
    tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
    })),
    null,
    2
  )};
`;
  await writeFile("./src/tool-names.ts", toolNamesContent);

  await build({
    entrypoints: [entrypoint],
    outdir: destinationDir,
    sourcemap: "linked",
    target: "node",
    format: "esm",
    minify: false,
    throw: true,
    banner: "#!/usr/bin/env node",
  });

  // Set executable permissions on the output file
  const outputFile = join(destinationDir, "mcp-server.js");
  await chmod(outputFile, 0o755);

  // Build the MCP bundle file
  if (shouldPack) {
    await packExtension({
      extensionPath: ".",
      outputPath: "./mcp-server.mcpb",
      silent: false,
    });
  }
}

await buildMcpServer().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
