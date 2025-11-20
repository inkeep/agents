import * as z from "zod";
export type SubAgentRelation = {
    id: string;
    sourceSubAgentId: string;
    targetSubAgentId: string | null;
    relationType: string | null;
    createdAt: string;
    updatedAt: string;
};
export declare const SubAgentRelation$zodSchema: z.ZodType<SubAgentRelation, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentrelation.d.ts.map