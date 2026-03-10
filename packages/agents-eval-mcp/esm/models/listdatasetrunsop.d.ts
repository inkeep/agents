import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListDatasetRunsRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
};
export declare const ListDatasetRunsRequest$zodSchema: z.ZodType<
  ListDatasetRunsRequest,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetRunsData = {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  datasetRunConfigId: string;
  createdAt: string;
  updatedAt: string;
};
export declare const ListDatasetRunsData$zodSchema: z.ZodType<
  ListDatasetRunsData,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of dataset runs
 */
export type ListDatasetRunsResponseBody = {
  data: Array<ListDatasetRunsData>;
  pagination: Pagination;
};
export declare const ListDatasetRunsResponseBody$zodSchema: z.ZodType<
  ListDatasetRunsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetRunsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListDatasetRunsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListDatasetRunsResponse$zodSchema: z.ZodType<
  ListDatasetRunsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listdatasetrunsop.d.ts.map
