'use server';

import { cache } from 'react';
import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

export interface Branch {
  name: string;
  hash: string;
  isDefault: boolean;
  createdAt?: string;
}

async function $fetchBranches(tenantId: string, projectId: string): Promise<Branch[]> {
  const response = await makeManagementApiRequest<ListResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches`
  );

  return response.data;
}

export const fetchBranches = cache($fetchBranches);
