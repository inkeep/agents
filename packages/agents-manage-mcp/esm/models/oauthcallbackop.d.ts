import * as z from "zod";
export type OauthCallbackRequest = {
    code: string;
    state: string;
    error?: string | undefined;
    error_description?: string | undefined;
};
export declare const OauthCallbackRequest$zodSchema: z.ZodType<OauthCallbackRequest, z.ZodTypeDef, unknown>;
export type OauthCallbackResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    fourHundredTextHtmlRes?: string | undefined;
    fiveHundredTextHtmlRes?: string | undefined;
};
export declare const OauthCallbackResponse$zodSchema: z.ZodType<OauthCallbackResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=oauthcallbackop.d.ts.map