import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListEvaluationSuiteConfigEvaluatorsRequest = {
  tenantId: string;
  projectId: string;
  configId: string;
};
export declare const ListEvaluationSuiteConfigEvaluatorsRequest$zodSchema: z.ZodType<
  ListEvaluationSuiteConfigEvaluatorsRequest,
  z.ZodTypeDef,
  unknown
>;
export type ListEvaluationSuiteConfigEvaluatorsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  anies?: Array<any | null> | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListEvaluationSuiteConfigEvaluatorsResponse$zodSchema: z.ZodType<
  ListEvaluationSuiteConfigEvaluatorsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listevaluationsuiteconfigevaluatorsop.d.ts.map
