import * as z from "zod";
export type SubAgentArtifactComponentResponseData = {
    id: string;
    subAgentId: string;
    artifactComponentId: string;
    createdAt: string;
};
export declare const SubAgentArtifactComponentResponseData$zodSchema: z.ZodType<SubAgentArtifactComponentResponseData, z.ZodTypeDef, unknown>;
export type SubAgentArtifactComponentResponse = {
    data: SubAgentArtifactComponentResponseData;
};
export declare const SubAgentArtifactComponentResponse$zodSchema: z.ZodType<SubAgentArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentartifactcomponentresponse.d.ts.map