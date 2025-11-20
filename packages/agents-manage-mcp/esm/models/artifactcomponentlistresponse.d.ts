import * as z from "zod";
import { ArtifactComponent } from "./artifactcomponent.js";
import { Pagination } from "./pagination.js";
export type ArtifactComponentListResponse = {
    data: Array<ArtifactComponent>;
    pagination: Pagination;
};
export declare const ArtifactComponentListResponse$zodSchema: z.ZodType<ArtifactComponentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=artifactcomponentlistresponse.d.ts.map