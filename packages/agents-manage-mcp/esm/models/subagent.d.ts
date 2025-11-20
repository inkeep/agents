import * as z from "zod";
export type SubAgent = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    conversationHistoryConfig?: any | null | undefined;
    models?: any | null | undefined;
    stopWhen?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const SubAgent$zodSchema: z.ZodType<SubAgent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagent.d.ts.map