import { getWorld } from 'workflow/runtime';

// Get the world instance - this uses postgres world based on env vars
// set in workflow-bootstrap.ts (must be imported first in index.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const world: any = getWorld();

