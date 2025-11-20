import * as z from "zod";
/**
 * Transport protocol type
 */
export declare const ThirdPartyMCPServerResponseTransport$zodSchema: z.ZodEnum<["streamable_http", "sse"]>;
export type ThirdPartyMCPServerResponseTransport = z.infer<typeof ThirdPartyMCPServerResponseTransport$zodSchema>;
export type ThirdPartyMCPServerResponseData = {
    id: string;
    name: string;
    url: string;
    transport: ThirdPartyMCPServerResponseTransport;
    imageUrl?: string | undefined;
    isOpen?: boolean | undefined;
    category?: string | undefined;
    description?: string | undefined;
    thirdPartyConnectAccountUrl?: string | undefined;
};
export declare const ThirdPartyMCPServerResponseData$zodSchema: z.ZodType<ThirdPartyMCPServerResponseData, z.ZodTypeDef, unknown>;
export type ThirdPartyMCPServerResponse = {
    data: ThirdPartyMCPServerResponseData | null;
};
export declare const ThirdPartyMCPServerResponse$zodSchema: z.ZodType<ThirdPartyMCPServerResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=thirdpartymcpserverresponse.d.ts.map