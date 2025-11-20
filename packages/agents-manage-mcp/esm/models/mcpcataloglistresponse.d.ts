import * as z from "zod";
/**
 * Transport protocol type
 */
export declare const MCPCatalogListResponseTransport$zodSchema: z.ZodEnum<["streamable_http", "sse"]>;
export type MCPCatalogListResponseTransport = z.infer<typeof MCPCatalogListResponseTransport$zodSchema>;
export type MCPCatalogListResponseData = {
    id: string;
    name: string;
    url: string;
    transport: MCPCatalogListResponseTransport;
    imageUrl?: string | undefined;
    isOpen?: boolean | undefined;
    category?: string | undefined;
    description?: string | undefined;
    thirdPartyConnectAccountUrl?: string | undefined;
};
export declare const MCPCatalogListResponseData$zodSchema: z.ZodType<MCPCatalogListResponseData, z.ZodTypeDef, unknown>;
export type MCPCatalogListResponse = {
    data: Array<MCPCatalogListResponseData>;
};
export declare const MCPCatalogListResponse$zodSchema: z.ZodType<MCPCatalogListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=mcpcataloglistresponse.d.ts.map