import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationRunConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const GetEvaluationRunConfigRequest$zodSchema: z.ZodType<
  GetEvaluationRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation run config details
 */
export type GetEvaluationRunConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const GetEvaluationRunConfigResponseBody$zodSchema: z.ZodType<
  GetEvaluationRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationRunConfigResponse$zodSchema: z.ZodType<
  GetEvaluationRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationrunconfigop.d.ts.map
