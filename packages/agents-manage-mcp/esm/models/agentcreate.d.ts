import * as z from "zod";
export type AgentCreate = {
    id: string;
    name: string;
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
export declare const AgentCreate$zodSchema: z.ZodType<AgentCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=agentcreate.d.ts.map