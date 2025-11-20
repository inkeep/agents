import * as z from "zod";
import { Model } from "./model.js";
export type SubAgentUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    prompt?: string | undefined;
    conversationHistoryConfig?: any | null | undefined;
    models?: Model | undefined;
    stopWhen?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const SubAgentUpdate$zodSchema: z.ZodType<SubAgentUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentupdate.d.ts.map