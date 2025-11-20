import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InkeepAgentsCore } from "../core.js";
import { SDKOptions } from "../lib/config.js";
import type { ConsoleLogger } from "./console-logger.js";
import { MCPScope } from "./scopes.js";
export declare function createMCPServer(deps: {
    logger: ConsoleLogger;
    allowedTools?: string[] | undefined;
    scopes?: MCPScope[] | undefined;
    getSDK?: () => InkeepAgentsCore;
    serverURL?: string | undefined;
    serverIdx?: SDKOptions["serverIdx"] | undefined;
}): McpServer;
//# sourceMappingURL=server.d.ts.map