import * as z from "zod";
export declare const McpToolTypeMcp$zodSchema: z.ZodEnum<["mcp"]>;
export type McpToolTypeMcp = z.infer<typeof McpToolTypeMcp$zodSchema>;
export type McpToolServer = {
    url: string;
};
export declare const McpToolServer$zodSchema: z.ZodType<McpToolServer, z.ZodTypeDef, unknown>;
export declare const McpToolTransportType$zodSchema: z.ZodEnum<["streamable_http", "sse"]>;
export type McpToolTransportType = z.infer<typeof McpToolTransportType$zodSchema>;
/**
 * Reconnection options for streamable HTTP transport
 */
export type McpToolReconnectionOptions = {};
export declare const McpToolReconnectionOptions$zodSchema: z.ZodType<McpToolReconnectionOptions, z.ZodTypeDef, unknown>;
export type McpToolTransport = {
    type: McpToolTransportType;
    requestInit?: {
        [k: string]: any | null;
    } | undefined;
    eventSourceInit?: {
        [k: string]: any | null;
    } | undefined;
    reconnectionOptions?: McpToolReconnectionOptions | undefined;
    sessionId?: string | undefined;
};
export declare const McpToolTransport$zodSchema: z.ZodType<McpToolTransport, z.ZodTypeDef, unknown>;
export type McpToolMcp = {
    server: McpToolServer;
    transport?: McpToolTransport | undefined;
    activeTools?: Array<string> | undefined;
};
export declare const McpToolMcp$zodSchema: z.ZodType<McpToolMcp, z.ZodTypeDef, unknown>;
export type McpToolConfig = {
    type: McpToolTypeMcp;
    mcp: McpToolMcp;
};
export declare const McpToolConfig$zodSchema: z.ZodType<McpToolConfig, z.ZodTypeDef, unknown>;
export type AvailableTool = {
    name: string;
    description?: string | undefined;
    inputSchema?: {
        [k: string]: any | null;
    } | undefined;
};
export declare const AvailableTool$zodSchema: z.ZodType<AvailableTool, z.ZodTypeDef, unknown>;
export declare const Status$zodSchema: z.ZodEnum<["healthy", "unhealthy", "unknown", "needs_auth"]>;
export type Status = z.infer<typeof Status$zodSchema>;
export type McpTool = {
    tenantId: string;
    id: string;
    projectId: string;
    name: string;
    description?: string | null | undefined;
    config: McpToolConfig;
    credentialReferenceId?: string | null | undefined;
    headers?: any | null | undefined;
    imageUrl?: string | undefined;
    capabilities?: any | null | undefined;
    lastError?: string | null | undefined;
    createdAt: string;
    updatedAt: string;
    availableTools?: Array<AvailableTool> | undefined;
    status?: Status | undefined;
    version?: string | undefined;
    expiresAt?: string | undefined;
    relationshipId?: string | undefined;
};
export declare const McpTool$zodSchema: z.ZodType<McpTool, z.ZodTypeDef, unknown>;
//# sourceMappingURL=mcptool.d.ts.map