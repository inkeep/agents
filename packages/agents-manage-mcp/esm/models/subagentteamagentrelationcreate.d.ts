import * as z from "zod";
export type SubAgentTeamAgentRelationCreate = {
    targetAgentId: string;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentTeamAgentRelationCreate$zodSchema: z.ZodType<SubAgentTeamAgentRelationCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentteamagentrelationcreate.d.ts.map