import * as z from "zod";
export declare const StatusComponentType$zodSchema: z.ZodEnum<["object"]>;
export type StatusComponentType = z.infer<typeof StatusComponentType$zodSchema>;
export type DetailsSchema = {
    type: StatusComponentType;
    properties: {
        [k: string]: any | null;
    };
    required?: Array<string> | undefined;
};
export declare const DetailsSchema$zodSchema: z.ZodType<DetailsSchema, z.ZodTypeDef, unknown>;
export type StatusComponent = {
    type: string;
    description?: string | undefined;
    detailsSchema?: DetailsSchema | undefined;
};
export declare const StatusComponent$zodSchema: z.ZodType<StatusComponent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=statuscomponent.d.ts.map