import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type RemoveEvaluatorFromSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
  evaluatorId: string;
};
export declare const RemoveEvaluatorFromSuiteConfigRequest$zodSchema: z.ZodType<
  RemoveEvaluatorFromSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type RemoveEvaluatorFromSuiteConfigResponse = {
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
export declare const RemoveEvaluatorFromSuiteConfigResponse$zodSchema: z.ZodType<
  RemoveEvaluatorFromSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=removeevaluatorfromsuiteconfigop.d.ts.map
