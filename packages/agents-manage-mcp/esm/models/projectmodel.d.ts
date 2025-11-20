import * as z from "zod";
import { ModelSettings } from "./modelsettings.js";
export type ProjectModel = {
    base: ModelSettings;
    structuredOutput?: ModelSettings | undefined;
    summarizer?: ModelSettings | undefined;
};
export declare const ProjectModel$zodSchema: z.ZodType<ProjectModel, z.ZodTypeDef, unknown>;
//# sourceMappingURL=projectmodel.d.ts.map