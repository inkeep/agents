import { ApiKeyApiInsertSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const DATE_ENUM = ['1d', '1w', '1m', '3m', '1y', 'never'] as const;

export type ApiKeyDate = (typeof DATE_ENUM)[number];

export const EXPIRATION_DATE_OPTIONS: { value: ApiKeyDate; label: string }[] = [
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week' },
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'never', label: 'No expiration' },
];

function convertDurationToDate(duration: ApiKeyDate): string | undefined {
  if (duration === 'never') {
    return;
  }

  const now = new Date();

  switch (duration) {
    case '1d':
      now.setDate(now.getDate() + 1);
      break;
    case '1w':
      now.setDate(now.getDate() + 7);
      break;
    case '1m':
      now.setMonth(now.getMonth() + 1);
      break;
    case '3m':
      now.setMonth(now.getMonth() + 3);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() + 1);
      break;
    default:
      return;
  }

  return now.toISOString();
}

export const ApiKeySchema = ApiKeyApiInsertSchema.pick({
  name: true,
  agentId: true,
}).extend({
  expiresAt: z.enum(DATE_ENUM).transform(convertDurationToDate).optional(),
});
export const ApiKeyUpdateSchema = ApiKeySchema.omit({
  agentId: true,
});

export type ApiKeyFormData = z.input<typeof ApiKeySchema>;

export type ApiKeyUpdateData = z.infer<typeof ApiKeyUpdateSchema>;
