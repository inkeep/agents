import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slackApi } from './slack-api';

export const slackQueryKeys = {
  all: ['slack'] as const,
  status: (userId: string) => [...slackQueryKeys.all, 'status', userId] as const,
  workspaceInfo: (connectionId: string) =>
    [...slackQueryKeys.all, 'workspace-info', connectionId] as const,
};

export function useSlackConnectionStatusQuery(userId: string | undefined) {
  return useQuery({
    queryKey: slackQueryKeys.status(userId || ''),
    queryFn: () => slackApi.getConnectionStatus(userId as string),
    enabled: !!userId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

export function useSlackWorkspaceInfoQuery(connectionId: string | undefined) {
  return useQuery({
    queryKey: slackQueryKeys.workspaceInfo(connectionId || ''),
    queryFn: () => slackApi.getWorkspaceInfo(connectionId as string),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSlackConnectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.createConnectSession,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.status(variables.userId) });
    },
  });
}

export function useSlackDisconnectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: (_data, variables) => {
      if (variables.userId) {
        queryClient.invalidateQueries({ queryKey: slackQueryKeys.status(variables.userId) });
      }
      if (variables.connectionId) {
        queryClient.removeQueries({
          queryKey: slackQueryKeys.workspaceInfo(variables.connectionId),
        });
      }
    },
  });
}

export function useSlackRefreshSessionMutation() {
  return useMutation({
    mutationFn: slackApi.refreshSession,
  });
}

export function useInvalidateSlackQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateStatus: (userId: string) =>
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.status(userId) }),
    invalidateWorkspaceInfo: (connectionId: string) =>
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaceInfo(connectionId) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: slackQueryKeys.all }),
  };
}
