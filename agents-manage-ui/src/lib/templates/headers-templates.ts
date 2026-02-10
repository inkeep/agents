/**
 * Generic headers template
 */
export const headersTemplate = JSON.stringify(
  {
    'X-Your-Header': 'your-value',
    'Content-Type': 'application/json',
  },
  null,
  2
);

/**
 * Headers template for external A2A agents
 */
export const externalAgentHeadersTemplate = JSON.stringify(
  { Authorization: 'Bearer <your-api-key>' },
  null,
  2
);

/**
 * Headers template for team agents (same project)
 */
export const teamAgentHeadersTemplate = JSON.stringify({ 'X-Your-Header': 'your-value' }, null, 2);

export const customHeadersTemplate = JSON.stringify({ tz: 'US/Pacific' }, null, 2);
