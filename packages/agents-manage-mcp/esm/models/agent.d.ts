import * as z from "zod";
export type Agent = {
    id: string;
    name: string;
    description: string | null;
    defaultSubAgentId: string | null;
    contextConfigId: string | null;
    models?: any | null | undefined;
    statusUpdates?: any | null | undefined;
    prompt: string | null;
    stopWhen?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const Agent$zodSchema: z.ZodType<Agent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=agent.d.ts.map