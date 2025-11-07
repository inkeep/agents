export const windsurfTemplate = `

1. Open [Windsurf](https://docs.windsurf.com/windsurf/cascade/mcp). Create a \`.windsurf\` directory in your project root if there isn't one already.

2. Create or open the \`mcp_config.json\` file in the \`.windsurf\` directory.

3. Add the following configuration:

\`\`\`bash
{
  "mcpServers": {
    "{{AGENT_NAME}}": {
      "serverUrl": "{{MCP_SERVER_URL}}",
      "headers": {
        "Authorization": "Bearer INKEEP_AGENT_API_KEY"
      }
    }
  }
}
\`\`\`

4. Save the configuration file. You may need to restart Windsurf to see the changes.

5. You can verify the connection by opening the composer (\`Cmd/Ctrl + L\`) in **code mode** and asking a question.
`;
