import * as z from 'zod';
import { type ArtifactComponent } from './artifactcomponent.js';
import { type Pagination } from './pagination.js';
export type ArtifactComponentListResponse = {
    data: Array<ArtifactComponent>;
    pagination: Pagination;
};
export declare const ArtifactComponentListResponse$zodSchema: z.ZodType<ArtifactComponentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=artifactcomponentlistresponse.d.ts.map