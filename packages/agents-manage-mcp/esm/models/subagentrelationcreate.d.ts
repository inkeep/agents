import * as z from "zod";
export declare const SubAgentRelationCreateRelationType$zodSchema: z.ZodEnum<["transfer", "delegate"]>;
export type SubAgentRelationCreateRelationType = z.infer<typeof SubAgentRelationCreateRelationType$zodSchema>;
export type SubAgentRelationCreate = {
    id: string;
    sourceSubAgentId: string;
    targetSubAgentId?: string | undefined;
    relationType: SubAgentRelationCreateRelationType;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    externalSubAgentId?: string | undefined;
    teamSubAgentId?: string | undefined;
};
export declare const SubAgentRelationCreate$zodSchema: z.ZodType<SubAgentRelationCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentrelationcreate.d.ts.map