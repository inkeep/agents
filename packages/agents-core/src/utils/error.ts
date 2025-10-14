import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { getLogger } from './logger';

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'internal_server_error',
  'unprocessable_entity',
]);

const errorCodeToHttpStatus: Record<z.infer<typeof ErrorCode>, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable_entity: 422,
  internal_server_error: 500,
};

export const ERROR_DOCS_BASE_URL = 'https://docs.inkeep.com/agents-api/errors';

export const problemDetailsSchema = z
  .object({
    // type: z.string().url().openapi({
    //   description: "A URI reference that identifies the problem type.",
    //   example: `${ERROR_DOCS_BASE_URL}#not-found`,
    // }),
    title: z.string().openapi({
      description: 'A short, human-readable summary of the problem type.',
      example: 'Resource Not Found',
    }),
    status: z.number().int().openapi({
      description: 'The HTTP status code.',
      example: 404,
    }),
    detail: z.string().openapi({
      description: 'A human-readable explanation specific to this occurrence of the problem.',
      example: 'The requested resource was not found.',
    }),
    instance: z.string().optional().openapi({
      description: 'A URI reference that identifies the specific occurrence of the problem.',
      example: '/conversations/123',
    }),
    requestId: z.string().optional().openapi({
      description: 'A unique identifier for the request, useful for troubleshooting.',
      example: 'req_1234567890',
    }),
    code: ErrorCode.openapi({
      description: 'A short code indicating the error code returned.',
      example: 'not_found',
    }),
  })
  .openapi('ProblemDetails');

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type ErrorCodes = z.infer<typeof ErrorCode>;

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCode.openapi({
        description: 'A short code indicating the error code returned.',
        example: 'not_found',
      }),
      message: z.string().openapi({
        description: 'A human readable error message.',
        example: 'The requested resource was not found.',
      }),
    }),
  })
  .openapi('ErrorResponse');

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export function createApiError({
  code,
  message,
  instance,
  requestId,
}: {
  code: ErrorCodes;
  message: string;
  instance?: string;
  requestId?: string;
}): HTTPException {
  const status = errorCodeToHttpStatus[code];
  const title = getTitleFromCode(code);
  const _type = `${ERROR_DOCS_BASE_URL}#${code}`;

  const problemDetails: ProblemDetails = {
    title,
    status,
    detail: message,
    code,
    ...(instance && { instance }),
    ...(requestId && { requestId }),
  };

  const errorMessage = message.length > 100 ? `${message.substring(0, 97)}...` : message;

  const responseBody = {
    ...problemDetails,
    error: { code, message: errorMessage },
  };

  const res = new Response(JSON.stringify(responseBody), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      ...(requestId && { 'X-Request-ID': requestId }),
    },
  });

  // @ts-expect-error - The HTTPException constructor expects a ContentfulStatusCode, but we're using a number
  // This is safe because we're only using valid HTTP status codes
  return new HTTPException(status, { message, res });
}

export async function handleApiError(
  error: unknown,
  requestId?: string
): Promise<ProblemDetails & { error: { code: ErrorCodes; message: string } }> {
  if (error instanceof HTTPException) {
    const errorData = error.getResponse();
    const responseText = await errorData.text();
    let responseJson: ProblemDetails & { error: { code: ErrorCodes; message: string } };

    try {
      responseJson = JSON.parse(responseText);
      if (requestId && !responseJson.requestId) {
        responseJson.requestId = requestId;
      }
    } catch (_e) {
      responseJson = {
        // type: `${ERROR_DOCS_BASE_URL}#internal_server_error`,
        title: 'Internal Server Error',
        status: error.status,
        detail: `Error processing request: ${responseText || 'Unknown error'}`,
        code: 'internal_server_error',
        ...(requestId && { requestId }),
        error: {
          code: 'internal_server_error',
          message: 'An internal server error occurred',
        },
      };
    }

    if (error.status >= 500) {
      getLogger('core').error(
        {
          error,
          status: error.status,
          message: responseJson.detail || responseJson.error.message,
          requestId: responseJson.requestId || requestId || 'unknown',
        },
        'API server error occurred'
      );
    } else {
      getLogger('core').info(
        {
          error,
          status: error.status,
          code: responseJson.code,
          message: responseJson.detail || responseJson.error.message,
          requestId: responseJson.requestId || requestId || 'unknown',
        },
        'API client error occurred'
      );
    }

    return responseJson;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  getLogger('core').error(
    {
      error,
      message: errorMessage,
      stack: errorStack,
      status: 500,
      requestId: requestId || 'unknown',
    },
    'Unhandled API error occurred'
  );

  const sanitizedErrorMessage =
    error instanceof Error
      ? error.message.replace(/\b(password|token|key|secret|auth)\b/gi, '[REDACTED]')
      : 'Unknown error';

  const problemDetails: ProblemDetails & { error: { code: ErrorCodes; message: string } } = {
    // type: `${ERROR_DOCS_BASE_URL}#internal_server_error`,
    title: 'Internal Server Error',
    status: 500,
    detail: `Server error occurred: ${sanitizedErrorMessage}`,
    code: 'internal_server_error',
    ...(requestId && { requestId }),
    error: {
      code: 'internal_server_error',
      message: 'An internal server error occurred. Please try again later.',
    },
  };

  return problemDetails;
}

function getTitleFromCode(code: ErrorCodes): string {
  switch (code) {
    case 'bad_request':
      return 'Bad Request';
    case 'unauthorized':
      return 'Unauthorized';
    case 'forbidden':
      return 'Forbidden';
    case 'not_found':
      return 'Not Found';
    case 'conflict':
      return 'Conflict';
    case 'unprocessable_entity':
      return 'Unprocessable Entity';
    case 'internal_server_error':
      return 'Internal Server Error';
    default:
      return 'Error';
  }
}

const toTitleCase = (str: string) =>
  str
    ?.replace(/\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .replace(/\s+/g, '') ?? '';

export const errorSchemaFactory = (code: ErrorCodes, description: string) => ({
  description,
  content: {
    'application/problem+json': {
      schema: problemDetailsSchema
        .extend({
          code: z.literal(code).openapi({
            description: 'A short code indicating the error code returned.',
            example: code,
          }),
          detail: z.string().openapi({
            description:
              'A detailed explanation specific to this occurrence of the problem, providing context and specifics about what went wrong.',
            example: description,
          }),
          title: z.string().openapi({
            description: 'A short, human-readable summary of the problem type.',
            example: getTitleFromCode(code),
          }),
          // type: z.string().url().openapi({
          //   description: "A URI reference that identifies the problem type.",
          //   example: `${ERROR_DOCS_BASE_URL}#${code}`,
          // }),
          status: z.literal(errorCodeToHttpStatus[code]).openapi({
            description: 'The HTTP status code.',
            example: errorCodeToHttpStatus[code],
          }),
          error: z
            .object({
              code: z.literal(code).openapi({
                description: 'A short code indicating the error code returned.',
                example: code,
              }),
              message: z.string().openapi({
                description:
                  'A concise error message suitable for display to end users. May be truncated if the full detail is long.',
                example:
                  description.length > 100 ? `${description.substring(0, 97)}...` : description,
              }),
            })
            .openapi({
              description: 'Legacy error format for backward compatibility.',
            }),
        })
        .openapi(toTitleCase(description)),
    },
  },
});

export const commonCreateErrorResponses = {
  400: errorSchemaFactory('bad_request', 'Bad Request'),
  401: errorSchemaFactory('unauthorized', 'Unauthorized'),
  403: errorSchemaFactory('forbidden', 'Forbidden'),
  422: errorSchemaFactory('unprocessable_entity', 'Unprocessable Entity'),
  500: errorSchemaFactory('internal_server_error', 'Internal Server Error'),
} as const;

export const commonUpdateErrorResponses = {
  400: errorSchemaFactory('bad_request', 'Bad Request'),
  401: errorSchemaFactory('unauthorized', 'Unauthorized'),
  403: errorSchemaFactory('forbidden', 'Forbidden'),
  404: errorSchemaFactory('not_found', 'Not Found'),
  422: errorSchemaFactory('unprocessable_entity', 'Unprocessable Entity'),
  500: errorSchemaFactory('internal_server_error', 'Internal Server Error'),
} as const;

export const commonGetErrorResponses = {
  400: errorSchemaFactory('bad_request', 'Bad Request'),
  401: errorSchemaFactory('unauthorized', 'Unauthorized'),
  403: errorSchemaFactory('forbidden', 'Forbidden'),
  404: errorSchemaFactory('not_found', 'Not Found'),
  422: errorSchemaFactory('unprocessable_entity', 'Unprocessable Entity'),
  500: errorSchemaFactory('internal_server_error', 'Internal Server Error'),
} as const;

export const commonDeleteErrorResponses = {
  400: errorSchemaFactory('bad_request', 'Bad Request'),
  401: errorSchemaFactory('unauthorized', 'Unauthorized'),
  403: errorSchemaFactory('forbidden', 'Forbidden'),
  404: errorSchemaFactory('not_found', 'Not Found'),
  422: errorSchemaFactory('unprocessable_entity', 'Unprocessable Entity'),
  500: errorSchemaFactory('internal_server_error', 'Internal Server Error'),
} as const;

export type CommonCreateErrorResponses = typeof commonCreateErrorResponses;
export type CommonUpdateErrorResponses = typeof commonUpdateErrorResponses;
export type CommonGetErrorResponses = typeof commonGetErrorResponses;
export type CommonDeleteErrorResponses = typeof commonDeleteErrorResponses;
