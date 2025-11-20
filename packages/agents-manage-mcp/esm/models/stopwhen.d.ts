import * as z from "zod";
export type StopWhen = {
    transferCountIs?: number | undefined;
    stepCountIs?: number | undefined;
};
export declare const StopWhen$zodSchema: z.ZodType<StopWhen, z.ZodTypeDef, unknown>;
//# sourceMappingURL=stopwhen.d.ts.map