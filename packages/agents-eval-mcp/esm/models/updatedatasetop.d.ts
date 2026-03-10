import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateDatasetRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  body?: any | null | undefined;
};
export declare const UpdateDatasetRequest$zodSchema: z.ZodType<
  UpdateDatasetRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset updated
 */
export type UpdateDatasetResponseBody = {
  data?: any | null | undefined;
};
export declare const UpdateDatasetResponseBody$zodSchema: z.ZodType<
  UpdateDatasetResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateDatasetResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateDatasetResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateDatasetResponse$zodSchema: z.ZodType<
  UpdateDatasetResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updatedatasetop.d.ts.map
