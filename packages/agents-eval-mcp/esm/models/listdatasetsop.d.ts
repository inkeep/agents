import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListDatasetsRequest = {
  tenantId: string;
  projectId: string;
};
export declare const ListDatasetsRequest$zodSchema: z.ZodType<
  ListDatasetsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of datasets
 */
export type ListDatasetsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListDatasetsResponseBody$zodSchema: z.ZodType<
  ListDatasetsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListDatasetsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListDatasetsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListDatasetsResponse$zodSchema: z.ZodType<
  ListDatasetsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listdatasetsop.d.ts.map
