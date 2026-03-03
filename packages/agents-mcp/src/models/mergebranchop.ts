import * as z from "zod";
import { BadRequest, BadRequest$zodSchema } from "./badrequest.js";
import { ErrorResponse, ErrorResponse$zodSchema } from "./errorresponse.js";
import {
  InternalServerError,
  InternalServerError$zodSchema,
} from "./internalservererror.js";
import { NotFound, NotFound$zodSchema } from "./notfound.js";
import { Unauthorized, Unauthorized$zodSchema } from "./unauthorized.js";
import {
  UnprocessableEntity,
  UnprocessableEntity$zodSchema,
} from "./unprocessableentity.js";

export type MergeBranchRequestBody = {
  message?: string | undefined;
};

export const MergeBranchRequestBody$zodSchema: z.ZodType<MergeBranchRequestBody> = z
  .object({
    message: z.string().optional().describe("Optional commit message for the merge"),
  });

export type MergeBranchRequest = {
  tenantId: string;
  projectId: string;
  branchName: string;
  body?: MergeBranchRequestBody | undefined;
};

export const MergeBranchRequest$zodSchema: z.ZodType<MergeBranchRequest> = z
  .object({
    branchName: z.string().describe("Branch name to merge into main"),
    body: MergeBranchRequestBody$zodSchema.optional(),
    projectId: z.string().describe("Project identifier"),
    tenantId: z.string().describe("Tenant identifier"),
  });

export type MergeBranchResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  MergeBranchResponse?: { data: { status: string; from: string; to: string; hasConflicts: boolean } } | undefined;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  ErrorResponse?: ErrorResponse | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};

export const MergeBranchResponse$zodSchema: z.ZodType<MergeBranchResponse> = z
  .object({
    BadRequest: BadRequest$zodSchema.optional(),
    ContentType: z.string(),
    ErrorResponse: ErrorResponse$zodSchema.optional(),
    InternalServerError: InternalServerError$zodSchema.optional(),
    MergeBranchResponse: z.object({
      data: z.object({
        status: z.string(),
        from: z.string(),
        to: z.string(),
        hasConflicts: z.boolean(),
      }),
    }).optional(),
    NotFound: NotFound$zodSchema.optional(),
    RawResponse: z.custom<Response>(x => x instanceof Response),
    StatusCode: z.int(),
    Unauthorized: Unauthorized$zodSchema.optional(),
    UnprocessableEntity: UnprocessableEntity$zodSchema.optional(),
  });
