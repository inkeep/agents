import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateEvaluationResultRequest = {
  tenantId: string;
  projectId: string;
  body?: any | null | undefined;
};
export declare const CreateEvaluationResultRequest$zodSchema: z.ZodType<
  CreateEvaluationResultRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation result created
 */
export type CreateEvaluationResultResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateEvaluationResultResponseBody$zodSchema: z.ZodType<
  CreateEvaluationResultResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationResultResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateEvaluationResultResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateEvaluationResultResponse$zodSchema: z.ZodType<
  CreateEvaluationResultResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createevaluationresultop.d.ts.map
