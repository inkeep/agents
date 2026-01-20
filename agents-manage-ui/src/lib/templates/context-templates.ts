/**
 * Context and configuration templates
 * Used for agent context config, headers, and status updates
 */

/**
 * Context variables template showing fetch-based dynamic context
 */
export const contextVariablesTemplate = `{
  "timeInfo": {
    "id": "time-info",
    "name": "Time Information",
    "trigger": "invocation",
    "fetchConfig": {
      "url": "https://api.example.com/time",
      "method": "GET",
      "headers": {
        "Content-Type": "application/json"
      }
    },
    "responseSchema": {
      "type": "object",
      "properties": {
        "datetime": { "type": "string" },
        "timezone": { "type": "string" }
      }
    },
    "defaultValue": "Unable to fetch time information"
  }
}`;

/**
 * Headers schema template for validating incoming request headers
 */
export const headersSchemaTemplate = `{
  "type": "object",
  "properties": {
    "x-user-id": {
      "type": "string",
      "description": "The user identifier"
    },
    "x-timezone": {
      "type": "string",
      "description": "User timezone (e.g., US/Pacific)"
    }
  },
  "required": ["x-user-id"]
}`;

/**
 * Status updates components template for structured agent status messages
 */
export const statusUpdatesComponentsTemplate = `[
  {
    "type": "tool_call_summary",
    "description": "A summary of a single tool call and why it was relevant to the current task. Be specific about what was found or accomplished.",
    "detailsSchema": {
      "type": "object",
      "properties": {
        "tool_name": {
          "type": "string",
          "description": "The name of the tool that was called"
        },
        "summary": {
          "type": "string",
          "description": "Brief summary of what was accomplished. Keep it to 3-5 words."
        },
        "status": {
          "type": "string",
          "enum": ["success", "error", "in_progress"],
          "description": "Status of the tool call"
        }
      },
      "required": ["tool_name", "summary"]
    }
  }
]`;
