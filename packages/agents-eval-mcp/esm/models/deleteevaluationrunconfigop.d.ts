import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteEvaluationRunConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const DeleteEvaluationRunConfigRequest$zodSchema: z.ZodType<
  DeleteEvaluationRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteEvaluationRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteEvaluationRunConfigResponse$zodSchema: z.ZodType<
  DeleteEvaluationRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deleteevaluationrunconfigop.d.ts.map
