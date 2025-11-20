import * as z from "zod";
export type ArtifactComponent = {
    id: string;
    name: string;
    description: string;
    props?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const ArtifactComponent$zodSchema: z.ZodType<ArtifactComponent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=artifactcomponent.d.ts.map