export const cursorTemplate = `
1. Open [Cursor](https://cursor.com/docs/context/mcp). Create a \`.cursor\` directory in your project root if there isn't one already.

2. Create or open the \`mcp.json\` file in the \`.cursor\` directory.

3. Add the following configuration:
\`\`\`bash
{
  "mcpServers": {
    "{{AGENT_NAME}}": {
      "type": "mcp",
      "url": "{{MCP_SERVER_URL}}",
      "headers": {
        "Authorization": "Bearer INKEEP_AGENT_API_KEY"
      }
    }
  }
}
\`\`\`

4. Save the configuration file. You may need to restart Cursor to see the changes.

5. You can also add the configuration globally by opening the command palette (\`Cmd/Ctrl + Shift + P\`) and selecting **Cursor Settings > MCP > Add new global MCP server**.

6. You can verify the connection by opening the composer (\`Cmd + I\`) in **agent mode** and asking a question.

`;
