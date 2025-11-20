import * as z from "zod";
export type ErrorResponse = {
    error: string;
    message?: string | undefined;
    details?: any | null | undefined;
};
export declare const ErrorResponse$zodSchema: z.ZodType<ErrorResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=errorresponse.d.ts.map