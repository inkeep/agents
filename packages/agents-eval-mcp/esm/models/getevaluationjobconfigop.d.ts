import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationJobConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const GetEvaluationJobConfigRequest$zodSchema: z.ZodType<
  GetEvaluationJobConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation job config details
 */
export type GetEvaluationJobConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const GetEvaluationJobConfigResponseBody$zodSchema: z.ZodType<
  GetEvaluationJobConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationJobConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationJobConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationJobConfigResponse$zodSchema: z.ZodType<
  GetEvaluationJobConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationjobconfigop.d.ts.map
