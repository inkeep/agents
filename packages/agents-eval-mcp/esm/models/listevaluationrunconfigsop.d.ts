import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListEvaluationRunConfigsRequest = {
  tenantId: string;
  projectId: string;
};
export declare const ListEvaluationRunConfigsRequest$zodSchema: z.ZodType<
  ListEvaluationRunConfigsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of evaluation run configs
 */
export type ListEvaluationRunConfigsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListEvaluationRunConfigsResponseBody$zodSchema: z.ZodType<
  ListEvaluationRunConfigsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListEvaluationRunConfigsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListEvaluationRunConfigsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListEvaluationRunConfigsResponse$zodSchema: z.ZodType<
  ListEvaluationRunConfigsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listevaluationrunconfigsop.d.ts.map
