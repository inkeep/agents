export const windsurfTemplate = `
1. Open [Windsurf](https://docs.windsurf.com/windsurf/cascade/mcp). Create a \`.windsurf\` directory in your project root if there isn't one already.
2. Create or open the \`mcp_config.json\` file in the \`.windsurf\` directory.
3. Add the following configuration:
\`\`\`json
{
  "mcpServers": {
    "inkeep": {
      "serverUrl": "{{MCP_SERVER_URL}}"
    }
  }
}
\`\`\`
4. Save the file and restart Windsurf if needed. Requires a Windsurf version with MCP OAuth support; on first connect it opens your browser to sign in to Inkeep — no API key required.
`;
