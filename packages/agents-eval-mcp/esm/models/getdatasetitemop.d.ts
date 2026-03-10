import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetDatasetItemRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  itemId: string;
};
export declare const GetDatasetItemRequest$zodSchema: z.ZodType<
  GetDatasetItemRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset item details
 */
export type GetDatasetItemResponseBody = {
  data?: any | null | undefined;
};
export declare const GetDatasetItemResponseBody$zodSchema: z.ZodType<
  GetDatasetItemResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetDatasetItemResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetDatasetItemResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetDatasetItemResponse$zodSchema: z.ZodType<
  GetDatasetItemResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getdatasetitemop.d.ts.map
