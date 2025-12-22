import { z } from 'zod';

const zAsAny = z as unknown as { int?: () => z.ZodNumber };

if (!zAsAny.int) {
  zAsAny.int = () => z.number().int();
}

export {};
