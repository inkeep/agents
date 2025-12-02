import * as z from 'zod';
import { type Pagination } from './pagination.js';
import { type Project } from './project.js';
export type ProjectListResponse = {
    data: Array<Project>;
    pagination: Pagination;
};
export declare const ProjectListResponse$zodSchema: z.ZodType<ProjectListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=projectlistresponse.d.ts.map