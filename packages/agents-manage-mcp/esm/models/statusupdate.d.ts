import * as z from "zod";
import { StatusComponent } from "./statuscomponent.js";
export type StatusUpdate = {
    enabled?: boolean | undefined;
    numEvents?: number | undefined;
    timeInSeconds?: number | undefined;
    prompt?: string | undefined;
    statusComponents?: Array<StatusComponent> | undefined;
};
export declare const StatusUpdate$zodSchema: z.ZodType<StatusUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=statusupdate.d.ts.map