import * as z from "zod";
export type HealthResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
};
export declare const HealthResponse$zodSchema: z.ZodType<HealthResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=healthop.d.ts.map