export const vscodeTemplate = `
1. Open [Visual Studio Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers). Create a \`.vscode\` directory in your project root if there isn't one already.
2. Create or open the \`mcp.json\` file in the \`.vscode\` directory.
3. Add the following configuration:
\`\`\`json
{
  "servers": {
    "inkeep": {
      "type": "http",
      "url": "{{MCP_SERVER_URL}}"
    }
  }
}
\`\`\`
4. Save the file and restart VS Code if needed. On first connect, VS Code opens your browser to sign in to Inkeep — no API key required.
`;
