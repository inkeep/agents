/**
 * Server-level `instructions` for the management MCP server.
 *
 * Per the MCP spec (InitializeResult.instructions), this string is returned in
 * the initialize handshake and "can be used by clients to improve the LLM's
 * understanding of available tools... For example, this information MAY be added
 * to the system prompt." It is a hint, surfaced at the client's discretion — a
 * supplement to per-tool descriptions, not a replacement.
 *
 * Keep it concise: it ships on every connect and may be injected into context.
 */

import { getLowLevelServer } from './mcpServerInternals';

export const INKEEP_MCP_INSTRUCTIONS = `This server is the CONTROL PLANE for the Inkeep agent platform: create, configure, and inspect agents, projects, tools, credentials, skills, components, triggers, and evaluations. It configures agents; it does not chat with or run them.

Choosing tools:

- Prefer the composite "*-full-*" tools for whole objects. Use create-full-agent / update-full-agent to create or fully edit an agent — they set the agent plus its sub-agents, tool assignments, relations, context config, triggers, and component links in ONE call. Use get-full-agent to read an agent's complete definition. The same applies to projects: create-full-project / update-full-project / get-full-project. Do not assemble an agent from many small calls when a composite exists.

- Per-entity tools (e.g. tools-*, credentials-*, context-configs-*) are for targeted, single-resource edits when you do not want to send the whole agent/project. For a small change to the agent itself (e.g. its name or description), use agents-update-agent — NOT update-full-agent, which replaces the entire agent definition and drops anything you omit.

- Definitions vs references: artifact-components, data-components, skills, and credentials are shared resources referenced BY ID. Create them first (e.g. create-data-component), then reference their IDs inside create-full-agent / update-full-agent. Context configs, functions, function-tools, and triggers are defined inline within the full-agent definition.

- Tools are namespaced by resource: agents-*, projects-*, tools-*, credentials-*, skills-*, triggers-*, scheduled-triggers-*, evaluations-*, and more. The evaluations-* group is a self-contained subsystem (datasets, evaluators, suite/run/job configs, results) relevant only for evaluation work.

- Your tenant is bound automatically from your authenticated session — NEVER pass a tenantId (the tools do not accept one). projectId IS a normal argument: supply it on project-scoped tools. Calls run within your permissions: list/get need "view"; create/update/delete need "edit"; creating or deleting a project requires an org admin role.

Typical flow to build an agent (no tenantId anywhere): list-projects -> (create-full-project if needed) -> create any shared data/artifact components, skills, or credentials -> create-full-agent referencing their IDs -> get-full-agent to verify.`;

/**
 * Inject the server `instructions` onto the underlying low-level MCP Server.
 *
 * Speakeasy constructs the server without instructions and exposes no config for
 * it, so we set the field directly before `connect()` (it is read when the
 * client's `initialize` request is handled). Best-effort: silently no-ops if the
 * pinned SDK's internal shape changes. Mirrors `fillMissingToolTitles`.
 */
export function setServerInstructions(mcpServer: unknown, instructions: string): void {
  const lowLevelServer = getLowLevelServer(mcpServer);
  if (lowLevelServer) {
    lowLevelServer._instructions = instructions;
  }
}
