import * as z from "zod";
export type InitiateOauthLoginPublicRequest = {
    tenantId: string;
    projectId: string;
    toolId: string;
};
export declare const InitiateOauthLoginPublicRequest$zodSchema: z.ZodType<InitiateOauthLoginPublicRequest, z.ZodTypeDef, unknown>;
export type InitiateOauthLoginPublicResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    fourHundredTextHtmlRes?: string | undefined;
    fourHundredAndFourTextHtmlRes?: string | undefined;
    fiveHundredTextHtmlRes?: string | undefined;
};
export declare const InitiateOauthLoginPublicResponse$zodSchema: z.ZodType<InitiateOauthLoginPublicResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=initiateoauthloginpublicop.d.ts.map