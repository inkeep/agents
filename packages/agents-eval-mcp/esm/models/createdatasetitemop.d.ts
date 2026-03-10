import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateDatasetItemRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  body?: any | null | undefined;
};
export declare const CreateDatasetItemRequest$zodSchema: z.ZodType<
  CreateDatasetItemRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset item created
 */
export type CreateDatasetItemResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateDatasetItemResponseBody$zodSchema: z.ZodType<
  CreateDatasetItemResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetItemResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateDatasetItemResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateDatasetItemResponse$zodSchema: z.ZodType<
  CreateDatasetItemResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createdatasetitemop.d.ts.map
