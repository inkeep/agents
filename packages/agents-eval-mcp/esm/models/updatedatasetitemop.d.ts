import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateDatasetItemRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  itemId: string;
  body?: any | null | undefined;
};
export declare const UpdateDatasetItemRequest$zodSchema: z.ZodType<
  UpdateDatasetItemRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset item updated
 */
export type UpdateDatasetItemResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateDatasetItemResponseBody$zodSchema: z.ZodType<
  UpdateDatasetItemResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateDatasetItemResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateDatasetItemResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateDatasetItemResponse$zodSchema: z.ZodType<
  UpdateDatasetItemResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updatedatasetitemop.d.ts.map
