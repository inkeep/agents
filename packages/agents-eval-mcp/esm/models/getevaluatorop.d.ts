import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluatorRequest = {
  tenantId: string;
  projectId: string;
  evaluatorId: string;
};
export declare const GetEvaluatorRequest$zodSchema: z.ZodType<
  GetEvaluatorRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluator details
 */
export type GetEvaluatorResponseBody = {
  data?: any | null | undefined;
};
export declare const GetEvaluatorResponseBody$zodSchema: z.ZodType<
  GetEvaluatorResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluatorResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluatorResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluatorResponse$zodSchema: z.ZodType<
  GetEvaluatorResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluatorop.d.ts.map
