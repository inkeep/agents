import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { objectOutputType, ZodRawShape, ZodTypeAny } from "zod";
import { InkeepAgentsCore } from "../core.js";
import { ConsoleLogger } from "./console-logger.js";
import { MCPScope } from "./scopes.js";
export type ToolDefinition<Args extends undefined | ZodRawShape = undefined> = Args extends ZodRawShape ? {
    name: string;
    description: string;
    scopes?: MCPScope[];
    args: Args;
    annotations: {
        title: string;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
        readOnlyHint: boolean;
    };
    tool: (client: InkeepAgentsCore, args: objectOutputType<Args, ZodTypeAny>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => CallToolResult | Promise<CallToolResult>;
} : {
    name: string;
    description: string;
    scopes?: MCPScope[];
    args?: undefined;
    annotations: {
        title: string;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
        readOnlyHint: boolean;
    };
    tool: (client: InkeepAgentsCore, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => CallToolResult | Promise<CallToolResult>;
};
export declare function formatResult(value: unknown, init: {
    response?: Response | undefined;
}): Promise<CallToolResult>;
export declare function createRegisterTool(logger: ConsoleLogger, server: McpServer, getSDK: () => InkeepAgentsCore, allowedScopes: Set<MCPScope>, allowedTools?: Set<string>): <A extends ZodRawShape | undefined>(tool: ToolDefinition<A>) => void;
//# sourceMappingURL=tools.d.ts.map