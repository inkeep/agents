import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationJobConfigResultsRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const GetEvaluationJobConfigResultsRequest$zodSchema: z.ZodType<
  GetEvaluationJobConfigResultsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation results retrieved
 */
export type GetEvaluationJobConfigResultsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const GetEvaluationJobConfigResultsResponseBody$zodSchema: z.ZodType<
  GetEvaluationJobConfigResultsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationJobConfigResultsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationJobConfigResultsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationJobConfigResultsResponse$zodSchema: z.ZodType<
  GetEvaluationJobConfigResultsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationjobconfigresultsop.d.ts.map
