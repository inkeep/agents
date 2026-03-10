import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetDatasetRunConfigRequest = {
  tenantId: string;
  projectId: string;
  runConfigId: string;
};
export declare const GetDatasetRunConfigRequest$zodSchema: z.ZodType<
  GetDatasetRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type GetDatasetRunConfigData = {
  name: string;
  description: string;
  datasetId: string;
  id: string;
  tenantId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};
export declare const GetDatasetRunConfigData$zodSchema: z.ZodType<
  GetDatasetRunConfigData,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset run config details
 */
export type GetDatasetRunConfigResponseBody = {
  data: GetDatasetRunConfigData;
};
export declare const GetDatasetRunConfigResponseBody$zodSchema: z.ZodType<
  GetDatasetRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetDatasetRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetDatasetRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetDatasetRunConfigResponse$zodSchema: z.ZodType<
  GetDatasetRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getdatasetrunconfigop.d.ts.map
