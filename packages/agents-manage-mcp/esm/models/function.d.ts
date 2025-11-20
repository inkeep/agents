import * as z from "zod";
export type FunctionT = {
    id: string;
    inputSchema?: any | null | undefined;
    executeCode: string;
    dependencies?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const FunctionT$zodSchema: z.ZodType<FunctionT, z.ZodTypeDef, unknown>;
//# sourceMappingURL=function.d.ts.map