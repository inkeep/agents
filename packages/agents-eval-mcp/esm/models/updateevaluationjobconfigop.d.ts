import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateEvaluationJobConfigRequestBody = {
  jobFilters?: any | null | undefined;
};
export declare const UpdateEvaluationJobConfigRequestBody$zodSchema: z.ZodType<
  UpdateEvaluationJobConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationJobConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
  body?: UpdateEvaluationJobConfigRequestBody | undefined;
};
export declare const UpdateEvaluationJobConfigRequest$zodSchema: z.ZodType<
  UpdateEvaluationJobConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation job config updated
 */
export type UpdateEvaluationJobConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateEvaluationJobConfigResponseBody$zodSchema: z.ZodType<
  UpdateEvaluationJobConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationJobConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateEvaluationJobConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateEvaluationJobConfigResponse$zodSchema: z.ZodType<
  UpdateEvaluationJobConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updateevaluationjobconfigop.d.ts.map
