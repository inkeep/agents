import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slackApi } from './slack-api';

const slackQueryKeys = {
  all: ['slack'] as const,
  workspaces: () => [...slackQueryKeys.all, 'workspaces'] as const,
  linkedUsers: (teamId: string) => [...slackQueryKeys.all, 'linked-users', teamId] as const,
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

export function useSlackLinkedUsersQuery(teamId: string | undefined) {
  return useQuery({
    queryKey: slackQueryKeys.linkedUsers(teamId || ''),
    queryFn: () => slackApi.getLinkedUsers(teamId as string),
    enabled: !!teamId,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useSlackUnlinkUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.unlinkUser,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: slackQueryKeys.linkedUsers(variables.slackTeamId),
      });
    },
  });
}
