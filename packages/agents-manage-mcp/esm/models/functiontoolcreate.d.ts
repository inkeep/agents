import * as z from "zod";
export type FunctionToolCreate = {
    id: string;
    name: string;
    description?: string | null | undefined;
    functionId: string;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const FunctionToolCreate$zodSchema: z.ZodType<FunctionToolCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functiontoolcreate.d.ts.map