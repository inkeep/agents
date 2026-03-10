import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteDatasetRunConfigRequest = {
  tenantId: string;
  projectId: string;
  runConfigId: string;
};
export declare const DeleteDatasetRunConfigRequest$zodSchema: z.ZodType<
  DeleteDatasetRunConfigRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteDatasetRunConfigResponse = {
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
export declare const DeleteDatasetRunConfigResponse$zodSchema: z.ZodType<
  DeleteDatasetRunConfigResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deletedatasetrunconfigop.d.ts.map
