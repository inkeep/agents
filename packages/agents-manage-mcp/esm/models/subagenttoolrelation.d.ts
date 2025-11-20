import * as z from "zod";
export type SubAgentToolRelation = {
    id: string;
    subAgentId: string;
    toolId: string;
    selectedTools?: any | null | undefined;
    headers?: any | null | undefined;
    toolPolicies?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const SubAgentToolRelation$zodSchema: z.ZodType<SubAgentToolRelation, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagenttoolrelation.d.ts.map