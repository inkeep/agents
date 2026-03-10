import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type UpdateDatasetRunConfigRequestBody = {
  name?: string | undefined;
  description?: string | undefined;
  datasetId?: string | undefined;
  agentIds?: Array<string> | undefined;
  evaluatorIds?: Array<string> | undefined;
};
export declare const UpdateDatasetRunConfigRequestBody$zodSchema: z.ZodType<
  UpdateDatasetRunConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateDatasetRunConfigRequest = {
  tenantId: string;
  projectId: string;
  runConfigId: string;
  body?: UpdateDatasetRunConfigRequestBody | undefined;
};
export declare const UpdateDatasetRunConfigRequest$zodSchema: z.ZodType<
  UpdateDatasetRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type UpdateDatasetRunConfigData = {
  name: string;
  description: string;
  datasetId: string;
  id: string;
  tenantId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};
export declare const UpdateDatasetRunConfigData$zodSchema: z.ZodType<
  UpdateDatasetRunConfigData,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset run config updated
 */
export type UpdateDatasetRunConfigResponseBody = {
  data: UpdateDatasetRunConfigData;
};
export declare const UpdateDatasetRunConfigResponseBody$zodSchema: z.ZodType<
  UpdateDatasetRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type UpdateDatasetRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: UpdateDatasetRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateDatasetRunConfigResponse$zodSchema: z.ZodType<
  UpdateDatasetRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=updatedatasetrunconfigop.d.ts.map
