import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetDatasetRunRequest = {
  tenantId: string;
  projectId: string;
  runId: string;
};
export declare const GetDatasetRunRequest$zodSchema: z.ZodType<
  GetDatasetRunRequest,
  z.ZodTypeDef,
  unknown
>;
export type Conversation = {
  id: string;
  conversationId: string;
  datasetRunId: string;
  output?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
};
export declare const Conversation$zodSchema: z.ZodType<Conversation, z.ZodTypeDef, unknown>;
export type ItemConversation = {
  id: string;
  conversationId: string;
  datasetRunId: string;
  output?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
};
export declare const ItemConversation$zodSchema: z.ZodType<ItemConversation, z.ZodTypeDef, unknown>;
export type Item = {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  input?: any | null | undefined;
  expectedOutput?: any | null | undefined;
  simulationAgent?: any | null | undefined;
  createdAt: string;
  updatedAt: string;
  conversations: Array<ItemConversation>;
};
export declare const Item$zodSchema: z.ZodType<Item, z.ZodTypeDef, unknown>;
export type GetDatasetRunData = {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  datasetRunConfigId: string;
  createdAt: string;
  updatedAt: string;
  conversations: Array<Conversation>;
  items: Array<Item>;
};
export declare const GetDatasetRunData$zodSchema: z.ZodType<
  GetDatasetRunData,
  z.ZodTypeDef,
  unknown
>;
/**
 * Dataset run with conversations
 */
export type GetDatasetRunResponseBody = {
  data: GetDatasetRunData;
};
export declare const GetDatasetRunResponseBody$zodSchema: z.ZodType<
  GetDatasetRunResponseBody,
  z.ZodTypeDef,
  unknown
>;
export type GetDatasetRunResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  object?: GetDatasetRunResponseBody | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const GetDatasetRunResponse$zodSchema: z.ZodType<
  GetDatasetRunResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=getdatasetrunop.d.ts.map
