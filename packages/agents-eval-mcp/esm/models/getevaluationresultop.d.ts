import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationResultRequest = {
  tenantId: string;
  projectId: string;
  resultId: string;
};
export declare const GetEvaluationResultRequest$zodSchema: z.ZodType<
  GetEvaluationResultRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation result details
 */
export type GetEvaluationResultResponseBody = {
  data?: any | null | undefined;
};
export declare const GetEvaluationResultResponseBody$zodSchema: z.ZodType<
  GetEvaluationResultResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationResultResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationResultResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationResultResponse$zodSchema: z.ZodType<
  GetEvaluationResultResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationresultop.d.ts.map
