import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetEvaluationSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const GetEvaluationSuiteConfigRequest$zodSchema: z.ZodType<
  GetEvaluationSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation suite config details
 */
export type GetEvaluationSuiteConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const GetEvaluationSuiteConfigResponseBody$zodSchema: z.ZodType<
  GetEvaluationSuiteConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetEvaluationSuiteConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetEvaluationSuiteConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetEvaluationSuiteConfigResponse$zodSchema: z.ZodType<
  GetEvaluationSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getevaluationsuiteconfigop.d.ts.map
