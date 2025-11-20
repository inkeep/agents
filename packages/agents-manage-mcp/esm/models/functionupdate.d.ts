import * as z from "zod";
export type FunctionUpdate = {
    id?: string | undefined;
    inputSchema?: any | null | undefined;
    executeCode?: string | undefined;
    dependencies?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const FunctionUpdate$zodSchema: z.ZodType<FunctionUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functionupdate.d.ts.map