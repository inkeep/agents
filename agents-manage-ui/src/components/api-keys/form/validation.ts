import { z } from 'zod';

export const EXPIRATION_DATE_OPTIONS = [
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week' },
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'never', label: 'No expiration' },
];

export const apiKeySchema = z.object({
  // name: z.string().min(1, 'Please enter a name.'), // todo: will be added soon
  graphId: z.string().min(1, 'Please select a graph.'),
  expiresAt: z.enum(['1d', '1w', '1m', '3m', '1y', 'never'], {
    message: 'Please select a valid expiration date.',
  }),
});

export type ApiKeyFormData = z.infer<typeof apiKeySchema>;
