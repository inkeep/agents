import * as z from 'zod';
import { type DataComponent } from './datacomponent.js';
import { type Pagination } from './pagination.js';
export type DataComponentListResponse = {
    data: Array<DataComponent>;
    pagination: Pagination;
};
export declare const DataComponentListResponse$zodSchema: z.ZodType<DataComponentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=datacomponentlistresponse.d.ts.map