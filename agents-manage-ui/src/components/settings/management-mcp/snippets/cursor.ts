export const cursorTemplate = `
1. Open [Cursor](https://cursor.com/docs/context/mcp). Create a \`.cursor\` directory in your project root if there isn't one already.
2. Create or open the \`mcp.json\` file in the \`.cursor\` directory.
3. Add the following configuration:
\`\`\`json
{
  "mcpServers": {
    "inkeep": {
      "type": "mcp",
      "url": "{{MCP_SERVER_URL}}"
    }
  }
}
\`\`\`
4. Save the file and restart Cursor if needed. On first connect, Cursor opens your browser to sign in to Inkeep — no API key required.
5. You can also add it globally via the command palette (\`Cmd/Ctrl + Shift + P\`) → **Cursor Settings > Tools & MCPs > New MCP Server**.
`;
