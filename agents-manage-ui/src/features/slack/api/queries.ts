import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slackApi } from './slack-api';

export const slackQueryKeys = {
  all: ['slack'] as const,
  workspaces: () => [...slackQueryKeys.all, 'workspaces'] as const,
  workspaceSettings: (teamId: string) =>
    [...slackQueryKeys.all, 'workspace-settings', teamId] as const,
};

export function useSlackWorkspacesQuery() {
  return useQuery({
    queryKey: slackQueryKeys.workspaces(),
    queryFn: () => slackApi.listWorkspaceInstallations(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useSlackUninstallWorkspaceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.uninstallWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaces() });
    },
  });
}

export function useSlackWorkspaceSettingsQuery(teamId: string | undefined) {
  return useQuery({
    queryKey: slackQueryKeys.workspaceSettings(teamId || ''),
    queryFn: () => slackApi.getWorkspaceSettings(teamId as string),
    enabled: !!teamId,
    staleTime: 60 * 1000,
  });
}

export function useInvalidateSlackQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateWorkspaces: () =>
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaces() }),
    invalidateWorkspaceSettings: (teamId: string) =>
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaceSettings(teamId) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: slackQueryKeys.all }),
  };
}
