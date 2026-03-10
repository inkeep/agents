import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type CreateDatasetRunConfigRequestBody = {
  name: string;
  description: string;
  datasetId: string;
  agentIds?: Array<string> | undefined;
  evaluatorIds?: Array<string> | undefined;
};
export declare const CreateDatasetRunConfigRequestBody$zodSchema: z.ZodType<
  CreateDatasetRunConfigRequestBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetRunConfigRequest = {
  tenantId: string;
  projectId: string;
  body?: CreateDatasetRunConfigRequestBody | undefined;
};
export declare const CreateDatasetRunConfigRequest$zodSchema: z.ZodType<
  CreateDatasetRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetRunConfigData = {
  name: string;
  description: string;
  datasetId: string;
  id: string;
  tenantId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};
export declare const CreateDatasetRunConfigData$zodSchema: z.ZodType<
  CreateDatasetRunConfigData,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset run config created
 */
export type CreateDatasetRunConfigResponseBody = {
  data: CreateDatasetRunConfigData;
};
export declare const CreateDatasetRunConfigResponseBody$zodSchema: z.ZodType<
  CreateDatasetRunConfigResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type CreateDatasetRunConfigResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: CreateDatasetRunConfigResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const CreateDatasetRunConfigResponse$zodSchema: z.ZodType<
  CreateDatasetRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=createdatasetrunconfigop.d.ts.map
