import * as z from "zod";
export type ArtifactComponentUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    props?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ArtifactComponentUpdate$zodSchema: z.ZodType<ArtifactComponentUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=artifactcomponentupdate.d.ts.map