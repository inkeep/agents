import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Pagination } from './pagination.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type ListEvaluatorsRequest = {
  tenantId: string;
  projectId: string;
};
export declare const ListEvaluatorsRequest$zodSchema: z.ZodType<
  ListEvaluatorsRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * List of evaluators
 */
export type ListEvaluatorsResponseBody = {
  data: Array<any | null>;
  pagination: Pagination;
};
export declare const ListEvaluatorsResponseBody$zodSchema: z.ZodType<
  ListEvaluatorsResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type ListEvaluatorsResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: ListEvaluatorsResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const ListEvaluatorsResponse$zodSchema: z.ZodType<
  ListEvaluatorsResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=listevaluatorsop.d.ts.map
