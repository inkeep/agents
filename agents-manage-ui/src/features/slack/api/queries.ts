import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slackApi } from './slack-api';

export const slackKeys = {
  all: ['slack'] as const,
  status: (userId: string) => [...slackKeys.all, 'status', userId] as const,
  workspaceInfo: (connectionId: string) =>
    [...slackKeys.all, 'workspace-info', connectionId] as const,
};

export function useSlackConnectionStatus(userId: string | undefined) {
  return useQuery({
    queryKey: slackKeys.status(userId || ''),
    queryFn: () => slackApi.getConnectionStatus(userId as string),
    enabled: !!userId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useSlackWorkspaceInfo(connectionId: string | undefined) {
  return useQuery({
    queryKey: slackKeys.workspaceInfo(connectionId || ''),
    queryFn: () => slackApi.getWorkspaceInfo(connectionId as string),
    enabled: !!connectionId,
    staleTime: 60 * 1000,
  });
}

export function useSlackConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.createConnectSession,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: slackKeys.status(variables.userId) });
    },
  });
}

export function useSlackDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: (_data, variables) => {
      if (variables.userId) {
        queryClient.invalidateQueries({ queryKey: slackKeys.status(variables.userId) });
      }
      queryClient.invalidateQueries({ queryKey: slackKeys.all });
    },
  });
}
