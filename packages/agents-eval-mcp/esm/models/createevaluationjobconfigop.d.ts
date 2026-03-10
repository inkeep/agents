import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateEvaluationJobConfigRequestBody = {
  jobFilters?: any | null | undefined;
  evaluatorIds?: Array<string> | undefined;
};
export declare const CreateEvaluationJobConfigRequestBody$zodSchema: z.ZodType<
  CreateEvaluationJobConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationJobConfigRequest = {
  tenantId: string;
  projectId: string;
  body?: CreateEvaluationJobConfigRequestBody | undefined;
};
export declare const CreateEvaluationJobConfigRequest$zodSchema: z.ZodType<
  CreateEvaluationJobConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation job config created
 */
export type CreateEvaluationJobConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateEvaluationJobConfigResponseBody$zodSchema: z.ZodType<
  CreateEvaluationJobConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationJobConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateEvaluationJobConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateEvaluationJobConfigResponse$zodSchema: z.ZodType<
  CreateEvaluationJobConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createevaluationjobconfigop.d.ts.map
