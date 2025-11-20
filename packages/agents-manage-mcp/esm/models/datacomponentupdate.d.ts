import * as z from "zod";
export type DataComponentUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    props?: any | null | undefined;
    render?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const DataComponentUpdate$zodSchema: z.ZodType<DataComponentUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=datacomponentupdate.d.ts.map