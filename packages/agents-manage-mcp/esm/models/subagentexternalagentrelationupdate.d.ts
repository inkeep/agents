import * as z from "zod";
export type SubAgentExternalAgentRelationUpdate = {
    id?: string | undefined;
    subAgentId?: string | undefined;
    externalAgentId?: string | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentExternalAgentRelationUpdate$zodSchema: z.ZodType<SubAgentExternalAgentRelationUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentexternalagentrelationupdate.d.ts.map