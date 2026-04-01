import { defineRelations } from 'drizzle-orm';
import * as schema from './runtime-schema';

export const runtimeRelations = defineRelations(schema, (r) => ({
  userProfile: {
    user: r.one.user({
      from: r.userProfile.userId,
      to: r.user.id,
    }),
  },
  conversations: {
    messages: r.many.messages({
      from: r.conversations.id,
      to: r.messages.conversationId,
    }),
  },
  messages: {
    conversation: r.one.conversations({
      from: r.messages.conversationId,
      to: r.conversations.id,
    }),
    task: r.one.tasks({
      from: r.messages.taskId,
      to: r.tasks.id,
    }),
    parentMessage: r.one.messages({
      from: r.messages.parentMessageId,
      to: r.messages.id,
      alias: 'parentChild',
    }),
    childMessages: r.many.messages({
      from: r.messages.id,
      to: r.messages.parentMessageId,
      alias: 'parentChild',
    }),
  },
  tasks: {
    messages: r.many.messages({
      from: r.tasks.id,
      to: r.messages.taskId,
    }),
    ledgerArtifacts: r.many.ledgerArtifacts({
      from: r.tasks.id,
      to: r.ledgerArtifacts.taskId,
    }),
    parentRelations: r.many.taskRelations({
      from: r.tasks.id,
      to: r.taskRelations.childTaskId,
      alias: 'childTask',
    }),
    childRelations: r.many.taskRelations({
      from: r.tasks.id,
      to: r.taskRelations.parentTaskId,
      alias: 'parentTask',
    }),
  },
  taskRelations: {
    parentTask: r.one.tasks({
      from: r.taskRelations.parentTaskId,
      to: r.tasks.id,
      alias: 'parentTask',
    }),
    childTask: r.one.tasks({
      from: r.taskRelations.childTaskId,
      to: r.tasks.id,
      alias: 'childTask',
    }),
  },
  ledgerArtifacts: {
    task: r.one.tasks({
      from: r.ledgerArtifacts.taskId,
      to: r.tasks.id,
    }),
  },
  workAppGitHubInstallations: {
    repositories: r.many.workAppGitHubRepositories({
      from: r.workAppGitHubInstallations.id,
      to: r.workAppGitHubRepositories.installationDbId,
    }),
  },
  workAppGitHubRepositories: {
    installation: r.one.workAppGitHubInstallations({
      from: r.workAppGitHubRepositories.installationDbId,
      to: r.workAppGitHubInstallations.id,
    }),
    projectAccess: r.many.workAppGitHubProjectRepositoryAccess({
      from: r.workAppGitHubRepositories.id,
      to: r.workAppGitHubProjectRepositoryAccess.repositoryDbId,
    }),
    mcpToolAccess: r.many.workAppGitHubMcpToolRepositoryAccess({
      from: r.workAppGitHubRepositories.id,
      to: r.workAppGitHubMcpToolRepositoryAccess.repositoryDbId,
    }),
  },
  workAppGitHubProjectRepositoryAccess: {
    repository: r.one.workAppGitHubRepositories({
      from: r.workAppGitHubProjectRepositoryAccess.repositoryDbId,
      to: r.workAppGitHubRepositories.id,
    }),
  },
  workAppGitHubMcpToolRepositoryAccess: {
    repository: r.one.workAppGitHubRepositories({
      from: r.workAppGitHubMcpToolRepositoryAccess.repositoryDbId,
      to: r.workAppGitHubRepositories.id,
    }),
  },
}));
