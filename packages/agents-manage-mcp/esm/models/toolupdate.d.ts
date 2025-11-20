import * as z from "zod";
export declare const ToolUpdateTypeMcp$zodSchema: z.ZodEnum<["mcp"]>;
export type ToolUpdateTypeMcp = z.infer<typeof ToolUpdateTypeMcp$zodSchema>;
export type ToolUpdateServer = {
    url: string;
};
export declare const ToolUpdateServer$zodSchema: z.ZodType<ToolUpdateServer, z.ZodTypeDef, unknown>;
export declare const ToolUpdateTransportType$zodSchema: z.ZodEnum<["streamable_http", "sse"]>;
export type ToolUpdateTransportType = z.infer<typeof ToolUpdateTransportType$zodSchema>;
/**
 * Reconnection options for streamable HTTP transport
 */
export type ToolUpdateReconnectionOptions = {};
export declare const ToolUpdateReconnectionOptions$zodSchema: z.ZodType<ToolUpdateReconnectionOptions, z.ZodTypeDef, unknown>;
export type ToolUpdateTransport = {
    type: ToolUpdateTransportType;
    requestInit?: {
        [k: string]: any | null;
    } | undefined;
    eventSourceInit?: {
        [k: string]: any | null;
    } | undefined;
    reconnectionOptions?: ToolUpdateReconnectionOptions | undefined;
    sessionId?: string | undefined;
};
export declare const ToolUpdateTransport$zodSchema: z.ZodType<ToolUpdateTransport, z.ZodTypeDef, unknown>;
export type ToolUpdateMcp = {
    server: ToolUpdateServer;
    transport?: ToolUpdateTransport | undefined;
    activeTools?: Array<string> | undefined;
};
export declare const ToolUpdateMcp$zodSchema: z.ZodType<ToolUpdateMcp, z.ZodTypeDef, unknown>;
export type ToolUpdateConfig = {
    type: ToolUpdateTypeMcp;
    mcp: ToolUpdateMcp;
};
export declare const ToolUpdateConfig$zodSchema: z.ZodType<ToolUpdateConfig, z.ZodTypeDef, unknown>;
export type ToolUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    config?: ToolUpdateConfig | undefined;
    credentialReferenceId?: string | null | undefined;
    headers?: any | null | undefined;
    imageUrl?: string | undefined;
    capabilities?: any | null | undefined;
    lastError?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ToolUpdate$zodSchema: z.ZodType<ToolUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=toolupdate.d.ts.map