import * as z from "zod";
export type SubAgentToolRelationUpdateToolPolicies = {
    needsApproval?: boolean | undefined;
};
export declare const SubAgentToolRelationUpdateToolPolicies$zodSchema: z.ZodType<SubAgentToolRelationUpdateToolPolicies, z.ZodTypeDef, unknown>;
export type SubAgentToolRelationUpdate = {
    id?: string | undefined;
    subAgentId?: string | undefined;
    toolId?: string | undefined;
    selectedTools?: Array<string> | null | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    toolPolicies?: {
        [k: string]: SubAgentToolRelationUpdateToolPolicies;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentToolRelationUpdate$zodSchema: z.ZodType<SubAgentToolRelationUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagenttoolrelationupdate.d.ts.map