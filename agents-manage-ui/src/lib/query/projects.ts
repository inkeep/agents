'use client';

import type { ProjectPermissions } from '@inkeep/agents-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchProject, fetchProjectPermissions, fetchProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/types/project';

export const projectQueryKeys = {
  all: ['projects'] as const,
  tenant: (tenantId: string) => [...projectQueryKeys.all, tenantId] as const,
  list: (tenantId: string) => [...projectQueryKeys.tenant(tenantId), 'list'] as const,
  detail: (tenantId: string, projectId: string) =>
    [...projectQueryKeys.tenant(tenantId), projectId] as const,
  permissions: (tenantId: string, projectId: string) =>
    [...projectQueryKeys.detail(tenantId, projectId), 'permissions'] as const,
};

export const defaultProjectPermissions: ProjectPermissions = {
  canView: false,
  canUse: false,
  canEdit: false,
};

export function useProjectsQuery({
  tenantId,
  enabled = true,
}: {
  tenantId: string;
  enabled?: boolean;
}) {
  'use memo';
  return useQuery<Project[]>({
    queryKey: projectQueryKeys.list(tenantId),
    async queryFn() {
      const response = await fetchProjects(tenantId);
      return response.data;
    },
    enabled,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to load projects',
    },
  });
}

export function useProjectQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<Project>({
    queryKey: projectQueryKeys.detail(tenantId, projectId),
    async queryFn() {
      const response = await fetchProject(tenantId, projectId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to load project',
    },
  });
}

export function useProjectPermissionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<ProjectPermissions>({
    queryKey: projectQueryKeys.permissions(tenantId, projectId),
    queryFn: () => fetchProjectPermissions(tenantId, projectId),
    enabled,
    initialData: defaultProjectPermissions,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to load project permissions',
    },
  });
}

export function useProjectsInvalidation(tenantId: string) {
  'use memo';
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: projectQueryKeys.tenant(tenantId) });
  };
}
