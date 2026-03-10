import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateDatasetItemsBulkRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  body?: Array<any | null> | undefined;
};
export declare const CreateDatasetItemsBulkRequest$zodSchema: z.ZodType<
  CreateDatasetItemsBulkRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset items created
 */
export type CreateDatasetItemsBulkResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const CreateDatasetItemsBulkResponseBody$zodSchema: z.ZodType<
  CreateDatasetItemsBulkResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetItemsBulkResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateDatasetItemsBulkResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateDatasetItemsBulkResponse$zodSchema: z.ZodType<
  CreateDatasetItemsBulkResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createdatasetitemsbulkop.d.ts.map
