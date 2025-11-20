import * as z from "zod";
export type SubAgentDataComponentResponseData = {
    id: string;
    subAgentId: string;
    dataComponentId: string;
    createdAt: string;
};
export declare const SubAgentDataComponentResponseData$zodSchema: z.ZodType<SubAgentDataComponentResponseData, z.ZodTypeDef, unknown>;
export type SubAgentDataComponentResponse = {
    data: SubAgentDataComponentResponseData;
};
export declare const SubAgentDataComponentResponse$zodSchema: z.ZodType<SubAgentDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentdatacomponentresponse.d.ts.map