import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type AddEvaluatorToSuiteConfigRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
  evaluatorId: string;
};
export declare const AddEvaluatorToSuiteConfigRequest$zodSchema: z.ZodType<
  AddEvaluatorToSuiteConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type AddEvaluatorToSuiteConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  any?: any | null | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const AddEvaluatorToSuiteConfigResponse$zodSchema: z.ZodType<
  AddEvaluatorToSuiteConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=addevaluatortosuiteconfigop.d.ts.map
