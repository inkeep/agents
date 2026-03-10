import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListEvaluationJobConfigsRequest = {
  tenantId: string;
  projectId: string;
};
export declare const ListEvaluationJobConfigsRequest$zodSchema: z.ZodType<
  ListEvaluationJobConfigsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of evaluation job configs
 */
export type ListEvaluationJobConfigsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListEvaluationJobConfigsResponseBody$zodSchema: z.ZodType<
  ListEvaluationJobConfigsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListEvaluationJobConfigsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListEvaluationJobConfigsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListEvaluationJobConfigsResponse$zodSchema: z.ZodType<
  ListEvaluationJobConfigsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listevaluationjobconfigsop.d.ts.map
