import * as z from "zod";
export type ModelSettings = {
    model?: string | undefined;
    providerOptions?: {
        [k: string]: any | null;
    } | undefined;
};
export declare const ModelSettings$zodSchema: z.ZodType<ModelSettings, z.ZodTypeDef, unknown>;
//# sourceMappingURL=modelsettings.d.ts.map