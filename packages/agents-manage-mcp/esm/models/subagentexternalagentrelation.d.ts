import * as z from "zod";
export type SubAgentExternalAgentRelation = {
    id: string;
    subAgentId: string;
    externalAgentId: string;
    headers?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const SubAgentExternalAgentRelation$zodSchema: z.ZodType<SubAgentExternalAgentRelation, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentexternalagentrelation.d.ts.map