import * as z from "zod";
export declare const ToolCreateTypeMcp$zodSchema: z.ZodEnum<["mcp"]>;
export type ToolCreateTypeMcp = z.infer<typeof ToolCreateTypeMcp$zodSchema>;
export type ToolCreateServer = {
    url: string;
};
export declare const ToolCreateServer$zodSchema: z.ZodType<ToolCreateServer, z.ZodTypeDef, unknown>;
export declare const ToolCreateTransportType$zodSchema: z.ZodEnum<["streamable_http", "sse"]>;
export type ToolCreateTransportType = z.infer<typeof ToolCreateTransportType$zodSchema>;
/**
 * Reconnection options for streamable HTTP transport
 */
export type ToolCreateReconnectionOptions = {};
export declare const ToolCreateReconnectionOptions$zodSchema: z.ZodType<ToolCreateReconnectionOptions, z.ZodTypeDef, unknown>;
export type ToolCreateTransport = {
    type: ToolCreateTransportType;
    requestInit?: {
        [k: string]: any | null;
    } | undefined;
    eventSourceInit?: {
        [k: string]: any | null;
    } | undefined;
    reconnectionOptions?: ToolCreateReconnectionOptions | undefined;
    sessionId?: string | undefined;
};
export declare const ToolCreateTransport$zodSchema: z.ZodType<ToolCreateTransport, z.ZodTypeDef, unknown>;
export type ToolCreateMcp = {
    server: ToolCreateServer;
    transport?: ToolCreateTransport | undefined;
    activeTools?: Array<string> | undefined;
};
export declare const ToolCreateMcp$zodSchema: z.ZodType<ToolCreateMcp, z.ZodTypeDef, unknown>;
export type ToolCreateConfig = {
    type: ToolCreateTypeMcp;
    mcp: ToolCreateMcp;
};
export declare const ToolCreateConfig$zodSchema: z.ZodType<ToolCreateConfig, z.ZodTypeDef, unknown>;
export type ToolCreate = {
    id: string;
    name: string;
    description?: string | null | undefined;
    config: ToolCreateConfig;
    credentialReferenceId?: string | null | undefined;
    headers?: any | null | undefined;
    imageUrl?: string | undefined;
    capabilities?: any | null | undefined;
    lastError?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ToolCreate$zodSchema: z.ZodType<ToolCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=toolcreate.d.ts.map