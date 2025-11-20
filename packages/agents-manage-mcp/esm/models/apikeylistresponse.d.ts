import * as z from "zod";
import { ApiKey } from "./apikey.js";
import { Pagination } from "./pagination.js";
export type ApiKeyListResponse = {
    data: Array<ApiKey>;
    pagination: Pagination;
};
export declare const ApiKeyListResponse$zodSchema: z.ZodType<ApiKeyListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=apikeylistresponse.d.ts.map