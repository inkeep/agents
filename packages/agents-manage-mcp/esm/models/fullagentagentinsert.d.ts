import * as z from "zod";
import { CanDelegateToExternalAgent } from "./candelegatetoexternalagent.js";
import { CanDelegateToTeamAgent } from "./candelegatetoteamagent.js";
import { CanUseItem } from "./canuseitem.js";
import { Model } from "./model.js";
export declare const FullAgentAgentInsertType$zodSchema: z.ZodEnum<["internal"]>;
export type FullAgentAgentInsertType = z.infer<typeof FullAgentAgentInsertType$zodSchema>;
export type CanDelegateTo = CanDelegateToExternalAgent | CanDelegateToTeamAgent | string;
export declare const CanDelegateTo$zodSchema: z.ZodType<CanDelegateTo, z.ZodTypeDef, unknown>;
export type FullAgentAgentInsert = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    conversationHistoryConfig?: any | null | undefined;
    models?: Model | undefined;
    stopWhen?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    type: FullAgentAgentInsertType;
    canUse: Array<CanUseItem>;
    dataComponents?: Array<string> | undefined;
    artifactComponents?: Array<string> | undefined;
    canTransferTo?: Array<string> | undefined;
    canDelegateTo?: Array<CanDelegateToExternalAgent | CanDelegateToTeamAgent | string> | undefined;
};
export declare const FullAgentAgentInsert$zodSchema: z.ZodType<FullAgentAgentInsert, z.ZodTypeDef, unknown>;
//# sourceMappingURL=fullagentagentinsert.d.ts.map