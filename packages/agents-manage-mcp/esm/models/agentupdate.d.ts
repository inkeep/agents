import * as z from "zod";
export type AgentUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    defaultSubAgentId?: string | null | undefined;
    contextConfigId?: string | null | undefined;
    models?: any | null | undefined;
    statusUpdates?: any | null | undefined;
    prompt?: string | null | undefined;
    stopWhen?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const AgentUpdate$zodSchema: z.ZodType<AgentUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=agentupdate.d.ts.map