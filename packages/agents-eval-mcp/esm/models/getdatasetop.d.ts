import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetDatasetRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
};
export declare const GetDatasetRequest$zodSchema: z.ZodType<
  GetDatasetRequest,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset details
 */
export type GetDatasetResponseBody = {
  data?: any | null | undefined;
};
export declare const GetDatasetResponseBody$zodSchema: z.ZodType<
  GetDatasetResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetDatasetResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetDatasetResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetDatasetResponse$zodSchema: z.ZodType<
  GetDatasetResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getdatasetop.d.ts.map
