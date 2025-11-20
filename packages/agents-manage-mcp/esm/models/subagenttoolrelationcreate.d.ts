import * as z from "zod";
export type SubAgentToolRelationCreateToolPolicies = {
    needsApproval?: boolean | undefined;
};
export declare const SubAgentToolRelationCreateToolPolicies$zodSchema: z.ZodType<SubAgentToolRelationCreateToolPolicies, z.ZodTypeDef, unknown>;
export type SubAgentToolRelationCreate = {
    id: string;
    subAgentId: string;
    toolId: string;
    selectedTools?: Array<string> | null | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    toolPolicies?: {
        [k: string]: SubAgentToolRelationCreateToolPolicies;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentToolRelationCreate$zodSchema: z.ZodType<SubAgentToolRelationCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagenttoolrelationcreate.d.ts.map