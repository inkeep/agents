import * as z from "zod";
export type CanDelegateToTeamAgent = {
    agentId: string;
    subAgentTeamAgentRelationId?: string | undefined;
    headers?: {
        [k: string]: string;
    } | null | undefined;
};
export declare const CanDelegateToTeamAgent$zodSchema: z.ZodType<CanDelegateToTeamAgent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=candelegatetoteamagent.d.ts.map