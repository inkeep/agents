import * as z from "zod";
export type DataComponent = {
    id: string;
    name: string;
    description: string;
    props?: any | null | undefined;
    render?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const DataComponent$zodSchema: z.ZodType<DataComponent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=datacomponent.d.ts.map