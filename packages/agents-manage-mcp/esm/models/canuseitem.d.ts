import * as z from "zod";
export type CanUseItemToolPolicies = {
    needsApproval?: boolean | undefined;
};
export declare const CanUseItemToolPolicies$zodSchema: z.ZodType<CanUseItemToolPolicies, z.ZodTypeDef, unknown>;
export type CanUseItem = {
    agentToolRelationId?: string | undefined;
    toolId: string;
    toolSelection?: Array<string> | null | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
    toolPolicies?: {
        [k: string]: CanUseItemToolPolicies;
    } | null | undefined;
};
export declare const CanUseItem$zodSchema: z.ZodType<CanUseItem, z.ZodTypeDef, unknown>;
//# sourceMappingURL=canuseitem.d.ts.map