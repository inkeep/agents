import * as z from "zod";
import { ProjectModel } from "./projectmodel.js";
import { StopWhen } from "./stopwhen.js";
export type Project = {
    id: string;
    name: string;
    description: string;
    models: ProjectModel | null;
    stopWhen: StopWhen | null;
    createdAt: string;
    updatedAt: string;
};
export declare const Project$zodSchema: z.ZodType<Project, z.ZodTypeDef, unknown>;
//# sourceMappingURL=project.d.ts.map