import * as z from "zod";
import { ProjectModel } from "./projectmodel.js";
import { StopWhen } from "./stopwhen.js";
export type ProjectUpdate = {
    name?: string | undefined;
    description?: string | undefined;
    models?: ProjectModel | null | undefined;
    stopWhen?: StopWhen | null | undefined;
};
export declare const ProjectUpdate$zodSchema: z.ZodType<ProjectUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=projectupdate.d.ts.map