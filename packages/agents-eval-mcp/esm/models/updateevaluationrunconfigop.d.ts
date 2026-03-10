import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateEvaluationRunConfigRequestBody = {
  name?: string | undefined;
  description?: string | undefined;
  isActive?: boolean | undefined;
  suiteConfigIds?: Array<string> | undefined;
  evaluatorIds?: Array<string> | undefined;
};
export declare const UpdateEvaluationRunConfigRequestBody$zodSchema: z.ZodType<
  UpdateEvaluationRunConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationRunConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
  body?: UpdateEvaluationRunConfigRequestBody | undefined;
};
export declare const UpdateEvaluationRunConfigRequest$zodSchema: z.ZodType<
  UpdateEvaluationRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Evaluation run config updated
 */
export type UpdateEvaluationRunConfigResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateEvaluationRunConfigResponseBody$zodSchema: z.ZodType<
  UpdateEvaluationRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateEvaluationRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateEvaluationRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateEvaluationRunConfigResponse$zodSchema: z.ZodType<
  UpdateEvaluationRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updateevaluationrunconfigop.d.ts.map
