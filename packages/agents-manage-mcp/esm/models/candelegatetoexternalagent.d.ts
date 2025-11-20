import * as z from "zod";
export type CanDelegateToExternalAgent = {
    externalAgentId: string;
    subAgentExternalAgentRelationId?: string | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
};
export declare const CanDelegateToExternalAgent$zodSchema: z.ZodType<CanDelegateToExternalAgent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=candelegatetoexternalagent.d.ts.map