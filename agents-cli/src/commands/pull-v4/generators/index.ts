import type { GenerationTask } from '../generation-types';

export const generationTasks: Record<
  `./${string}-generator.ts`,
  GenerationTask<unknown>
> = import.meta
  // @ts-expect-error -- https://vite.dev/guide/features#named-imports
  .glob('./*-generator.ts', {
    import: 'task',
    eager: true,
  });
