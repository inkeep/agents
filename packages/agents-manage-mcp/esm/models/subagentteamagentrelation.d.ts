import * as z from "zod";
export type SubAgentTeamAgentRelation = {
    id: string;
    subAgentId: string;
    targetAgentId: string;
    headers?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const SubAgentTeamAgentRelation$zodSchema: z.ZodType<SubAgentTeamAgentRelation, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentteamagentrelation.d.ts.map