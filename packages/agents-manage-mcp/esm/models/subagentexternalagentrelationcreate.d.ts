import * as z from "zod";
export type SubAgentExternalAgentRelationCreate = {
    externalAgentId: string;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentExternalAgentRelationCreate$zodSchema: z.ZodType<SubAgentExternalAgentRelationCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentexternalagentrelationcreate.d.ts.map