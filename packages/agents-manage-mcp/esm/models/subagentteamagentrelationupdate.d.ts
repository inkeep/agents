import * as z from "zod";
export type SubAgentTeamAgentRelationUpdate = {
    id?: string | undefined;
    subAgentId?: string | undefined;
    targetAgentId?: string | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentTeamAgentRelationUpdate$zodSchema: z.ZodType<SubAgentTeamAgentRelationUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentteamagentrelationupdate.d.ts.map