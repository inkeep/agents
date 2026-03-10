import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteEvaluatorRequest = {
  tenantId: string;
  projectId: string;
  evaluatorId: string;
};
export declare const DeleteEvaluatorRequest$zodSchema: z.ZodType<
  DeleteEvaluatorRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteEvaluatorResponse = {
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
export declare const DeleteEvaluatorResponse$zodSchema: z.ZodType<
  DeleteEvaluatorResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deleteevaluatorop.d.ts.map
