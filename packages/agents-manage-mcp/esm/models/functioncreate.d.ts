import * as z from "zod";
export type FunctionCreate = {
    id: string;
    inputSchema?: any | null | undefined;
    executeCode: string;
    dependencies?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const FunctionCreate$zodSchema: z.ZodType<FunctionCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functioncreate.d.ts.map