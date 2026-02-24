import { z } from 'zod';

export const GitHubUserSchema = z.object({
  login: z.string(),
});

export const RepositorySchema = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  url: z.string().url(),
  defaultBranch: z.string(),
});

export const ReactionContentSchema = z.enum([
  '+1',
  '-1',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes',
]);

export const ReactionSchema = z.object({
  id: z.number(),
  user: z.string(),
  content: ReactionContentSchema,
  createdAt: z.string(),
});

export const ReactionsSchema = z.array(ReactionSchema);

export const PullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  author: GitHubUserSchema,
  url: z.string().url(),
  state: z.string(),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ChangedFileSchema = z.object({
  commit_messages: z.array(z.string()),
  path: z.string(),
  status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
  previousPath: z.string().optional(), // For renamed files
  contents: z.string().optional(), // Only if include-file-contents is true
});

export const CommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  author: GitHubUserSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  type: z.enum(['issue', 'review', 'review_summary']),
  // For review comments (inline code comments)
  path: z.string().optional(),
  line: z.number().optional(),
  diffHunk: z.string().optional(),
  isSuggestion: z.boolean().optional(),
  // For review summaries
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']).optional(),
  reactions: ReactionsSchema.optional(),
});

export const GitHubEventSchema = z.object({
  type: z.string(),
  action: z.string(),
});

export type GitHubUser = z.infer<typeof GitHubUserSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type PullRequest = z.infer<typeof PullRequestSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Reaction = z.infer<typeof ReactionSchema>;
export type Reactions = z.infer<typeof ReactionsSchema>;
export type GitHubEvent = z.infer<typeof GitHubEventSchema>;
export type ReactionContent = z.infer<typeof ReactionContentSchema>;
