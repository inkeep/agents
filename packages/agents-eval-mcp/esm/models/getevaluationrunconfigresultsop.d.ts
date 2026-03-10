import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationRunConfigResultsRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const GetEvaluationRunConfigResultsRequest$zodSchema: z.ZodType<
  GetEvaluationRunConfigResultsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation results retrieved
 */
export type GetEvaluationRunConfigResultsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const GetEvaluationRunConfigResultsResponseBody$zodSchema: z.ZodType<
  GetEvaluationRunConfigResultsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationRunConfigResultsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationRunConfigResultsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationRunConfigResultsResponse$zodSchema: z.ZodType<
  GetEvaluationRunConfigResultsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationrunconfigresultsop.d.ts.map
