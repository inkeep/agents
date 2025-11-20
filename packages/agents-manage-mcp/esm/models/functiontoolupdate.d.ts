import * as z from "zod";
export type FunctionToolUpdate = {
    id?: string | undefined;
    agentId?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    functionId?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const FunctionToolUpdate$zodSchema: z.ZodType<FunctionToolUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functiontoolupdate.d.ts.map