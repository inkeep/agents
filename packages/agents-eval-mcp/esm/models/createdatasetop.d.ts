import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateDatasetRequest = {
  tenantId: string;
  projectId: string;
  body?: any | null | undefined;
};
export declare const CreateDatasetRequest$zodSchema: z.ZodType<
  CreateDatasetRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset created
 */
export type CreateDatasetResponseBody = {
  data?: any | null | undefined;
};
export declare const CreateDatasetResponseBody$zodSchema: z.ZodType<
  CreateDatasetResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateDatasetResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateDatasetResponse$zodSchema: z.ZodType<
  CreateDatasetResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createdatasetop.d.ts.map
