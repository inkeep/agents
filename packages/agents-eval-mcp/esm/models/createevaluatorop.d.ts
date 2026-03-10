import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateEvaluatorRequest = {
  tenantId: string;
  projectId: string;
  body?: any | null | undefined;
};
export declare const CreateEvaluatorRequest$zodSchema: z.ZodType<
  CreateEvaluatorRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluator created
 */
export type CreateEvaluatorResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateEvaluatorResponseBody$zodSchema: z.ZodType<
  CreateEvaluatorResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluatorResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateEvaluatorResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateEvaluatorResponse$zodSchema: z.ZodType<
  CreateEvaluatorResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createevaluatorop.d.ts.map
