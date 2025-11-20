import * as z from "zod";
export type DataComponentCreate = {
    id: string;
    name: string;
    description: string;
    props?: any | null | undefined;
    render?: any | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const DataComponentCreate$zodSchema: z.ZodType<DataComponentCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=datacomponentcreate.d.ts.map