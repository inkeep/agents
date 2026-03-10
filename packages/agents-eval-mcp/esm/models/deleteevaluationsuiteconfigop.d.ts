import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteEvaluationSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const DeleteEvaluationSuiteConfigRequest$zodSchema: z.ZodType<
  DeleteEvaluationSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteEvaluationSuiteConfigResponse = {
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
export declare const DeleteEvaluationSuiteConfigResponse$zodSchema: z.ZodType<
  DeleteEvaluationSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deleteevaluationsuiteconfigop.d.ts.map
