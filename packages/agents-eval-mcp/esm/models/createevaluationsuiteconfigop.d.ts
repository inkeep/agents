import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateEvaluationSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  body?: any | null | undefined;
};
export declare const CreateEvaluationSuiteConfigRequest$zodSchema: z.ZodType<
  CreateEvaluationSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation suite config created
 */
export type CreateEvaluationSuiteConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateEvaluationSuiteConfigResponseBody$zodSchema: z.ZodType<
  CreateEvaluationSuiteConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationSuiteConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateEvaluationSuiteConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateEvaluationSuiteConfigResponse$zodSchema: z.ZodType<
  CreateEvaluationSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createevaluationsuiteconfigop.d.ts.map
