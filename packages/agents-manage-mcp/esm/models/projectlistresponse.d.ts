import * as z from "zod";
import { Pagination } from "./pagination.js";
import { Project } from "./project.js";
export type ProjectListResponse = {
    data: Array<Project>;
    pagination: Pagination;
};
export declare const ProjectListResponse$zodSchema: z.ZodType<ProjectListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=projectlistresponse.d.ts.map