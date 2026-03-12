import type { GenerationTask } from '../generation-types';

export const generationTasks: Record<`./${string}-generator.ts`, GenerationTask<any>> = import.meta
  // @ts-expect-error -- https://vite.dev/guide/features#named-imports
  .glob('./*-generator.ts', {
    import: 'task',
    eager: true,
  });
