export const vscodeTemplate = `

1. Open [Visual Studio Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers). Create a \`.vscode\` directory in your project root if there isn't one already.

2. Create or open the \`mcp.json\` file in the \`.vscode\` directory.

3. Add the following configuration:

\`\`\`bash
{
  "servers": {
    "{{AGENT_NAME}}": {
      "type": "http",
      "url": "{{MCP_SERVER_URL}}",
      "headers": {
        "Authorization": "Bearer INKEEP_AGENT_API_KEY"
      }
    }
  }
}
\`\`\`

4. Save the configuration file. You may need to restart VS Code to see the changes.

5. You can verify the connection by opening the composer (\`Ctrl + Alt + I\`) in **agent mode** and asking a question.

`;
