import * as z from "zod";
export declare const SubAgentRelationUpdateRelationType$zodSchema: z.ZodEnum<["transfer", "delegate"]>;
export type SubAgentRelationUpdateRelationType = z.infer<typeof SubAgentRelationUpdateRelationType$zodSchema>;
export type SubAgentRelationUpdate = {
    id?: string | undefined;
    sourceSubAgentId?: string | undefined;
    targetSubAgentId?: string | undefined;
    relationType?: SubAgentRelationUpdateRelationType | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    externalSubAgentId?: string | undefined;
    teamSubAgentId?: string | undefined;
};
export declare const SubAgentRelationUpdate$zodSchema: z.ZodType<SubAgentRelationUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentrelationupdate.d.ts.map