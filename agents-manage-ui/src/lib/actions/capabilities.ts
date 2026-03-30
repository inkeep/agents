'use server';

import { makeManagementApiRequest } from '@/lib/api/api-config';
import type { ActionResult } from './types';

export type Capabilities = {
  sandbox: {
    configured: boolean;
    provider?: 'native' | 'vercel';
    runtime?: 'node22' | 'typescript';
  };
};

export async function getCapabilitiesAction(): Promise<ActionResult<Capabilities>> {
  try {
    const data = await makeManagementApiRequest<Capabilities>('capabilities');
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch capabilities',
      code: 'unknown_error',
    };
  }
}
