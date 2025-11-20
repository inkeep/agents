import * as z from "zod";
import { ModelSettings } from "./modelsettings.js";
export type Model = {
    base?: ModelSettings | undefined;
    structuredOutput?: ModelSettings | undefined;
    summarizer?: ModelSettings | undefined;
};
export declare const Model$zodSchema: z.ZodType<Model, z.ZodTypeDef, unknown>;
//# sourceMappingURL=model.d.ts.map