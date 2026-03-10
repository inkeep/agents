import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateEvaluatorRequest = {
  tenantId: string;
  projectId: string;
  evaluatorId: string;
  body?: any | null | undefined;
};
export declare const UpdateEvaluatorRequest$zodSchema: z.ZodType<
  UpdateEvaluatorRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluator updated
 */
export type UpdateEvaluatorResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateEvaluatorResponseBody$zodSchema: z.ZodType<
  UpdateEvaluatorResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluatorResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateEvaluatorResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateEvaluatorResponse$zodSchema: z.ZodType<
  UpdateEvaluatorResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updateevaluatorop.d.ts.map
