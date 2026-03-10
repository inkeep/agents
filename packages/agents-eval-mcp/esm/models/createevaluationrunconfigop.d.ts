import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateEvaluationRunConfigRequestBody = {
  id?: string | undefined;
  name: string;
  description: string;
  isActive?: boolean | undefined;
  suiteConfigIds?: Array<string> | undefined;
};
export declare const CreateEvaluationRunConfigRequestBody$zodSchema: z.ZodType<
  CreateEvaluationRunConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationRunConfigRequest = {
  tenantId: string;
  projectId: string;
  body?: CreateEvaluationRunConfigRequestBody | undefined;
};
export declare const CreateEvaluationRunConfigRequest$zodSchema: z.ZodType<
  CreateEvaluationRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation run config created
 */
export type CreateEvaluationRunConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateEvaluationRunConfigResponseBody$zodSchema: z.ZodType<
  CreateEvaluationRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateEvaluationRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateEvaluationRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateEvaluationRunConfigResponse$zodSchema: z.ZodType<
  CreateEvaluationRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createevaluationrunconfigop.d.ts.map
