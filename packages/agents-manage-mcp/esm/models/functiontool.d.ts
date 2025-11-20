import * as z from "zod";
export type FunctionTool = {
    id: string;
    agentId: string;
    name: string;
    description: string | null;
    functionId: string;
    createdAt: string;
    updatedAt: string;
};
export declare const FunctionTool$zodSchema: z.ZodType<FunctionTool, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functiontool.d.ts.map