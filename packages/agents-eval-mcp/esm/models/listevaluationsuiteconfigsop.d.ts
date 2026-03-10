import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListEvaluationSuiteConfigsRequest = {
  tenantId: string;
  projectId: string;
};
export declare const ListEvaluationSuiteConfigsRequest$zodSchema: z.ZodType<
  ListEvaluationSuiteConfigsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of evaluation suite configs
 */
export type ListEvaluationSuiteConfigsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListEvaluationSuiteConfigsResponseBody$zodSchema: z.ZodType<
  ListEvaluationSuiteConfigsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListEvaluationSuiteConfigsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListEvaluationSuiteConfigsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListEvaluationSuiteConfigsResponse$zodSchema: z.ZodType<
  ListEvaluationSuiteConfigsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listevaluationsuiteconfigsop.d.ts.map
