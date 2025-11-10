export const claudeCodeTemplate = `
1. Install [Claude Code](https://claude.com/product/claude-code) by running the following command in your terminal:

\`\`\`bash
curl -fsSL https://claude.ai/install.sh | bash
\`\`\`

2. Navigate to the folder where your project is located and run the following command to add the MCP server to your Claude Code settings.

\`\`\`bash
claude mcp add --transport http --scope local {{AGENT_NAME}} {{MCP_SERVER_URL}} --header "Authorization: Bearer INKEEP_AGENT_API_KEY"
\`\`\`

3. You can verify the connection by entering the \`claude\` command and asking a question to Claude Code.

`;
