import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateEvaluationSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
  body?: any | null | undefined;
};
export declare const UpdateEvaluationSuiteConfigRequest$zodSchema: z.ZodType<
  UpdateEvaluationSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation suite config updated
 */
export type UpdateEvaluationSuiteConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateEvaluationSuiteConfigResponseBody$zodSchema: z.ZodType<
  UpdateEvaluationSuiteConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationSuiteConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateEvaluationSuiteConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateEvaluationSuiteConfigResponse$zodSchema: z.ZodType<
  UpdateEvaluationSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updateevaluationsuiteconfigop.d.ts.map
