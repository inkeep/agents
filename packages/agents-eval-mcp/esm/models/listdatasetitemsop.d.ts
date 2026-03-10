import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListDatasetItemsRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
};
export declare const ListDatasetItemsRequest$zodSchema: z.ZodType<
  ListDatasetItemsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of dataset items
 */
export type ListDatasetItemsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListDatasetItemsResponseBody$zodSchema: z.ZodType<
  ListDatasetItemsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetItemsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListDatasetItemsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListDatasetItemsResponse$zodSchema: z.ZodType<
  ListDatasetItemsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listdatasetitemsop.d.ts.map
