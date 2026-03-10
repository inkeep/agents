import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListDatasetRunConfigsRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
};
export declare const ListDatasetRunConfigsRequest$zodSchema: z.ZodType<
  ListDatasetRunConfigsRequest,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetRunConfigsData = {
  name: string;
  description: string;
  datasetId: string;
  id: string;
  tenantId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};
export declare const ListDatasetRunConfigsData$zodSchema: z.ZodType<
  ListDatasetRunConfigsData,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of dataset run configs
 */
export type ListDatasetRunConfigsResponseBody = {
  data: Array<ListDatasetRunConfigsData>;
  pagination: Pagination;
};
export declare const ListDatasetRunConfigsResponseBody$zodSchema: z.ZodType<
  ListDatasetRunConfigsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetRunConfigsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListDatasetRunConfigsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListDatasetRunConfigsResponse$zodSchema: z.ZodType<
  ListDatasetRunConfigsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listdatasetrunconfigsop.d.ts.map
