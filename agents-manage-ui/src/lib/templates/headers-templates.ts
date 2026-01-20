/**
 * Generic headers template
 */
export const headersTemplate = `{
  "X-Your-Header": "your-value",
  "Content-Type": "application/json"
}`;

/**
 * Headers template for external A2A agents
 */
export const externalAgentHeadersTemplate = `{
  "Authorization": "Bearer <your-api-key>"
}`;

/**
 * Headers template for team agents (same project)
 */
export const teamAgentHeadersTemplate = `{
  "X-Your-Header": "your-value"
}`;
