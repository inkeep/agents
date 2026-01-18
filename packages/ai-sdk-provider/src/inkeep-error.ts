import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const inkeepErrorDataSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
        value: z.unknown().optional(),
      })
    )
    .optional(),
});

export type InkeepErrorData = z.infer<typeof inkeepErrorDataSchema>;

export const inkeepFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: inkeepErrorDataSchema,
  errorToMessage: (data) => data.message || data.error,
});
