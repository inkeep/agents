export const claudeCodeTemplate = `
1. Install [Claude Code](https://claude.com/product/claude-code) if you haven't already:

\`\`\`bash
curl -fsSL https://claude.ai/install.sh | bash
\`\`\`

2. Add the Management MCP server. No API key — Claude Code opens your browser to sign in to Inkeep on first use:

\`\`\`bash
claude mcp add --transport http --scope local inkeep {{MCP_SERVER_URL}}
\`\`\`

3. Run \`claude\`, then \`/mcp\` to authorize and verify the connection.
`;
