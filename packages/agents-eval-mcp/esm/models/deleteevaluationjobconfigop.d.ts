import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteEvaluationJobConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const DeleteEvaluationJobConfigRequest$zodSchema: z.ZodType<
  DeleteEvaluationJobConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteEvaluationJobConfigResponse = {
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
export declare const DeleteEvaluationJobConfigResponse$zodSchema: z.ZodType<
  DeleteEvaluationJobConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deleteevaluationjobconfigop.d.ts.map
