import { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const keyValuePairSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type KeyValuePair = z.infer<typeof keyValuePairSchema>;

export const metadataSchema = z
  .array(keyValuePairSchema)
  .default([])
  .superRefine((pairs, ctx) => {
    const keys = pairs.map((pair) => pair.key.trim()).filter(Boolean);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        duplicates.add(key);
      } else {
        seen.add(key);
      }
    }
    if (duplicates.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Keys must be unique.',
      });
    }
  });

export const credentialFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .refine((val) => val.length > 0, 'Name cannot be empty after transformation')
    .refine((val) => val.length <= 50, 'Name must be 50 characters or less'),
  apiKeyToSet: z.string().min(1, 'Enter an API key'),
  metadata: metadataSchema,
  credentialStoreId: z.string().min(1, 'Please select a credential store'),
  credentialStoreType: z.enum(CredentialStoreType),
  selectedTool: z.string().optional(),
  selectedExternalAgent: z.string().optional(),
});

/** Internal form data type (metadata as array) */
export type CredentialFormData = z.output<typeof credentialFormSchema>;

/** Output type for handlers (metadata as record) */
export type CredentialFormOutput = Omit<CredentialFormData, 'metadata'> & {
  metadata: Record<string, string>;
};

/** Convert key-value pairs array to record, filtering empty keys */
export function keyValuePairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of pairs) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      result[trimmedKey] = value;
    }
  }
  return result;
}

/** Convert record to key-value pairs array */
export function recordToKeyValuePairs(record: Record<string, string> | undefined): KeyValuePair[] {
  if (!record || typeof record !== 'object') {
    return [];
  }
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
