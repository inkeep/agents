import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type DataComponentResponse } from './datacomponentresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetDataComponentByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetDataComponentByIdRequest$zodSchema: z.ZodType<GetDataComponentByIdRequest, z.ZodTypeDef, unknown>;
export type GetDataComponentByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    DataComponentResponse?: DataComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetDataComponentByIdResponse$zodSchema: z.ZodType<GetDataComponentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getdatacomponentbyidop.d.ts.map