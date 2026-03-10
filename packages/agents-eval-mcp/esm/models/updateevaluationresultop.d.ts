import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateEvaluationResultRequest = {
  tenantId: string;
  projectId: string;
  resultId: string;
  body?: any | null | undefined;
};
export declare const UpdateEvaluationResultRequest$zodSchema: z.ZodType<
  UpdateEvaluationResultRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation result updated
 */
export type UpdateEvaluationResultResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateEvaluationResultResponseBody$zodSchema: z.ZodType<
  UpdateEvaluationResultResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationResultResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateEvaluationResultResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateEvaluationResultResponse$zodSchema: z.ZodType<
  UpdateEvaluationResultResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updateevaluationresultop.d.ts.map
