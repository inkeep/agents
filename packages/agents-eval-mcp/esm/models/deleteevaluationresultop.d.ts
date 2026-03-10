import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteEvaluationResultRequest = {
  tenantId: string;
  projectId: string;
  resultId: string;
};
export declare const DeleteEvaluationResultRequest$zodSchema: z.ZodType<
  DeleteEvaluationResultRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteEvaluationResultResponse = {
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
export declare const DeleteEvaluationResultResponse$zodSchema: z.ZodType<
  DeleteEvaluationResultResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deleteevaluationresultop.d.ts.map
