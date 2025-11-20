import * as z from "zod";
import { Model } from "./model.js";
export type SubAgentCreate = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    conversationHistoryConfig?: any | null | undefined;
    models?: Model | undefined;
    stopWhen?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentCreate$zodSchema: z.ZodType<SubAgentCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentcreate.d.ts.map