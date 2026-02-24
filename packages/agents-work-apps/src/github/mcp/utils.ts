import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { minimatch } from 'minimatch';
import { env } from '../../env';
import { getLogger } from '../../logger';
import type {
  ChangedFile,
  Comment,
  GitHubUser,
  PullRequest,
  Reaction,
  ReactionContent,
  Reactions,
} from './schemas';

const logger = getLogger('github-mcp-utils');

export interface CommitData {
  commit_sha: string;
  commit_message: string;
  file_info: {
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
    status: string;
    raw_url: string;
    blob_url: string;
    patch?: string;
  };
}

export interface PullCommit {
  sha: string;
  commit: {
    message: string;
    author?: {
      name?: string;
      email?: string;
      date?: string;
    } | null;
  };
}

export function getGitHubClientFromRepo(
  owner: string,
  repo: string,
  installationIdMap: Map<string, string>
): Octokit {
  const repoFullName = `${owner}/${repo}`;
  const installationId = installationIdMap.get(repoFullName);
  if (!installationId) {
    logger.error({ owner, repo, installationIdMap }, 'Installation ID not found for repository');
    throw new Error(`Installation ID not found for repository ${repoFullName}`);
  }
  return getGitHubClientFromInstallationId(installationId);
}

export function getGitHubClientFromInstallationId(installationId: string): Octokit {
  if (!env.GITHUB_APP_PRIVATE_KEY) {
    logger.error({ installationId }, 'GITHUB_APP_PRIVATE_KEY is not set');
    throw new Error('GITHUB_APP_PRIVATE_KEY is not set');
  }
  const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  logger.info({ installationId }, 'Creating GitHub client for installation ID');
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: privateKey,
      installationId,
    },
  });
}

function mapUser(user: { login: string }): GitHubUser {
  return {
    login: user.login,
  };
}

/**
 * Fetch detailed reactions for an issue comment (with user attribution)
 */
async function fetchIssueCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number
): Promise<Reactions> {
  const reactions: Reactions = [];

  for await (const response of octokit.paginate.iterator(
    octokit.rest.reactions.listForIssueComment,
    {
      owner,
      repo,
      comment_id: commentId,
      per_page: 100,
    }
  )) {
    for (const reaction of response.data) {
      reactions.push({
        id: reaction.id,
        user: reaction.user?.login ?? '[deleted]',
        content: reaction.content as Reaction['content'],
        createdAt: reaction.created_at,
      });
    }
  }

  return reactions;
}

/**
 * Fetch detailed reactions for a pull request review comment (with user attribution)
 */
async function fetchReviewCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number
): Promise<Reactions> {
  const reactions: Reactions = [];

  for await (const response of octokit.paginate.iterator(
    octokit.rest.reactions.listForPullRequestReviewComment,
    {
      owner,
      repo,
      comment_id: commentId,
      per_page: 100,
    }
  )) {
    for (const reaction of response.data) {
      reactions.push({
        id: reaction.id,
        user: reaction.user?.login ?? '[deleted]',
        content: reaction.content as Reaction['content'],
        createdAt: reaction.created_at,
      });
    }
  }

  return reactions;
}

/**
 * Fetch pull request details
 */
export async function fetchPrInfo(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequest> {
  logger.info({ owner, repo, prNumber }, `Fetching PR #${prNumber} details`);

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    author: mapUser(pr.user),
    url: pr.html_url,
    state: pr.state,
    base: {
      ref: pr.base.ref,
      sha: pr.base.sha,
    },
    head: {
      ref: pr.head.ref,
      sha: pr.head.sha,
    },
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  };
}

/**
 * Fetch all commits in a pull request.
 */
export async function fetchPrCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullCommit[]> {
  try {
    const commits: PullCommit[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: perPage,
        page,
      });

      commits.push(...response.data);

      if (response.data.length < perPage) {
        break;
      }
      page++;
    }

    return commits;
  } catch (error) {
    throw new Error(
      `Failed to get PR commits: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch detailed information about a specific commit including its diff.
 */
export async function fetchCommitDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  commitSha: string
) {
  try {
    const response = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: commitSha,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to get commit details: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch changed files with optional path filtering and content fetching
 */
export async function fetchPrFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  pathFilters: string[] = [],
  includeContents: boolean = false,
  includePatch: boolean = false
): Promise<ChangedFile[]> {
  logger.info(
    { owner, repo, prNumber, pathFilters, includeContents, includePatch },
    `Fetching PR #${prNumber} changed files`
  );

  const pullRequest = await fetchPrInfo(octokit, owner, repo, prNumber);
  const headSha = pullRequest.head.sha;

  // Collect all files from pagination first
  const collectedFiles: ChangedFile[] = [];

  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })) {
    for (const file of response.data) {
      if (
        pathFilters.length > 0 &&
        !pathFilters.some((filter) => minimatch(file.filename, filter))
      ) {
        continue;
      }

      collectedFiles.push({
        commit_messages: [],
        path: file.filename,
        status: file.status as ChangedFile['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: includePatch ? file.patch : undefined,
        previousPath: file.previous_filename,
      });
    }
  }

  // Fetch file contents in parallel batches if requested
  if (includeContents) {
    const BATCH_SIZE = 10;
    const filesToFetch = collectedFiles.filter((f) => f.status !== 'removed');

    for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
      const batch = filesToFetch.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (changedFile) => {
          try {
            const { data: content } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: changedFile.path,
              ref: headSha,
            });

            if ('content' in content && content.encoding === 'base64') {
              changedFile.contents = Buffer.from(content.content, 'base64').toString('utf-8');
            }
          } catch (error) {
            logger.warn(
              { owner, repo, prNumber, headSha, file: changedFile.path },
              `Failed to fetch contents for ${changedFile.path}: ${error}`
            );
          }
        })
      );
    }
  }

  logger.info(
    {
      owner,
      repo,
      prNumber,
      headSha,
      pathFilters,
      includeContents,
      fileCount: collectedFiles.length,
    },
    `Found ${collectedFiles.length} changed files${pathFilters.length > 0 ? ` matching "${pathFilters.join(', ')}"` : ''}`
  );

  return collectedFiles;
}

/**
 * Get file-based diffs with all commit messages that impacted each file.
 */
export async function fetchPrFileDiffs(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ChangedFile[]> {
  try {
    // Fetch commits and PR files in parallel
    const [commits, prFiles] = await Promise.all([
      fetchPrCommits(octokit, owner, repo, prNumber),
      fetchPrFiles(octokit, owner, repo, prNumber),
    ]);

    // Fetch all commit details in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 10;
    const commitDetailsList: {
      sha: string;
      message: string;
      files: Awaited<ReturnType<typeof fetchCommitDetails>>['files'];
    }[] = [];

    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (commit) => {
          const commitDetails = await fetchCommitDetails(octokit, owner, repo, commit.sha);
          return {
            sha: commit.sha,
            message: commit.commit.message,
            files: commitDetails.files,
          };
        })
      );
      commitDetailsList.push(...batchResults);
    }

    // Group commits by file
    const fileToCommits: Record<string, CommitData[]> = {};

    for (const { sha, message, files } of commitDetailsList) {
      for (const fileInfo of files || []) {
        const filename = fileInfo.filename;

        if (!fileToCommits[filename]) {
          fileToCommits[filename] = [];
        }

        fileToCommits[filename].push({
          commit_sha: sha,
          commit_message: message,
          file_info: fileInfo,
        });
      }
    }

    // Build GithubFileDiffs objects
    const fileDiffs: ChangedFile[] = [];

    for (const prFile of prFiles) {
      const filename = prFile.path;

      if (filename in fileToCommits) {
        const commitMessages = fileToCommits[filename].map(
          (commitData) => commitData.commit_message
        );

        const githubFileDiff: ChangedFile = {
          commit_messages: commitMessages,
          path: filename,
          status: prFile.status,
          additions: prFile.additions || 0,
          deletions: prFile.deletions || 0,
          patch: prFile.patch,
        };

        fileDiffs.push(githubFileDiff);
      }
    }

    return fileDiffs;
  } catch (error) {
    throw new Error(
      `Failed to get PR file diffs: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch files changed on a branch compared to a base ref, without requiring a PR.
 * Uses the GitHub Compare API (`repos.compareCommitsWithBasehead`).
 */
export async function fetchBranchChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
  options: {
    pathFilters?: string[];
    includeContents?: boolean;
    includePatch?: boolean;
  } = {}
): Promise<ChangedFile[]> {
  const { pathFilters = [], includeContents = false, includePatch = false } = options;
  logger.info(
    { owner, repo, base, head, pathFilters, includeContents, includePatch },
    `Fetching changed files between ${base}...${head}`
  );

  const response = await octokit.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${base}...${head}`,
    per_page: 1,
  });

  const totalCommits = response.data.total_commits;

  const collectedFiles: ChangedFile[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const pageResponse = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${base}...${head}`,
      per_page: perPage,
      page,
    });

    const files = pageResponse.data.files ?? [];
    if (files.length === 0) break;

    for (const file of files) {
      if (
        pathFilters.length > 0 &&
        !pathFilters.some((filter) => minimatch(file.filename, filter))
      ) {
        continue;
      }

      collectedFiles.push({
        commit_messages: [],
        path: file.filename,
        status: file.status as ChangedFile['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: includePatch ? file.patch : undefined,
        previousPath: file.previous_filename,
      });
    }

    if (files.length < perPage) break;
    page++;
  }

  if (includeContents) {
    const BATCH_SIZE = 10;
    const filesToFetch = collectedFiles.filter((f) => f.status !== 'removed');

    for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
      const batch = filesToFetch.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (changedFile) => {
          try {
            const { data: content } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: changedFile.path,
              ref: head,
            });

            if ('content' in content && content.encoding === 'base64') {
              changedFile.contents = Buffer.from(content.content, 'base64').toString('utf-8');
            }
          } catch (error) {
            logger.warn(
              { owner, repo, base, head, file: changedFile.path },
              `Failed to fetch contents for ${changedFile.path}: ${error}`
            );
          }
        })
      );
    }
  }

  logger.info(
    {
      owner,
      repo,
      base,
      head,
      totalCommits,
      pathFilters,
      includeContents,
      fileCount: collectedFiles.length,
    },
    `Found ${collectedFiles.length} changed files between ${base}...${head} (${totalCommits} commits)`
  );

  return collectedFiles;
}

/**
 * Fetch all PR comments (both issue comments and review comments)
 */
export async function fetchComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Comment[]> {
  // Fetch all three comment types in parallel
  const [issueComments, reviewComments, reviewSummaries] = await Promise.all([
    // Issue comments (general PR comments)
    (async () => {
      const results: Comment[] = [];
      for await (const response of octokit.paginate.iterator(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      })) {
        for (const comment of response.data) {
          // Fetch detailed reactions if there are any
          let reactions: Reactions | undefined;
          if (comment.reactions && comment.reactions.total_count > 0) {
            try {
              reactions = await fetchIssueCommentReactions(octokit, owner, repo, comment.id);
            } catch (error) {
              logger.warn(
                { owner, repo, prNumber, commentId: comment.id },
                `Failed to fetch issue comment reactions: ${error}`
              );
              reactions = undefined;
            }
          }

          if (!comment.user) continue;
          results.push({
            id: comment.id,
            body: comment.body || '',
            author: mapUser(comment.user),
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            type: 'issue',
            reactions: reactions,
          });
        }
      }
      return results;
    })(),
    // Review comments (inline code comments)
    (async () => {
      const results: Comment[] = [];
      for await (const response of octokit.paginate.iterator(
        octokit.rest.pulls.listReviewComments,
        {
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100,
        }
      )) {
        for (const comment of response.data) {
          const isSuggestion = /```suggestion\b/.test(comment.body);
          // Fetch detailed reactions if there are any
          let reactions: Reactions | undefined;
          if (comment.reactions && comment.reactions.total_count > 0) {
            try {
              reactions = await fetchReviewCommentReactions(octokit, owner, repo, comment.id);
            } catch (error) {
              logger.warn(
                { owner, repo, prNumber, commentId: comment.id },
                `Failed to fetch review comment reactions: ${error}`
              );
              reactions = undefined;
            }
          }

          results.push({
            id: comment.id,
            body: comment.body,
            author: mapUser(comment.user),
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            type: 'review',
            path: comment.path,
            line: comment.line || comment.original_line,
            diffHunk: comment.diff_hunk,
            isSuggestion,
            reactions: reactions,
          });
        }
      }
      return results;
    })(),
    // Review summaries (approve/request changes with body text)
    (async () => {
      const results: Comment[] = [];
      for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      })) {
        for (const review of response.data) {
          if (review.body && review.user) {
            results.push({
              id: review.id,
              body: review.body,
              author: mapUser(review.user),
              createdAt: review.submitted_at ?? new Date().toISOString(),
              type: 'review_summary',
              state: review.state as Comment['state'],
            });
          }
        }
      }
      return results;
    })(),
  ]);

  const comments = [...issueComments, ...reviewComments, ...reviewSummaries];

  // Drop comments from bots other than inkeep[bot]
  return comments.filter((c) => {
    const login = c.author.login;
    if (login.endsWith('[bot]') && login !== 'inkeep[bot]') {
      return false;
    }
    return true;
  });
}

/**
 * Generate a markdown representation of a pull request with file diffs
 */
export function generatePrMarkdown(
  pr: PullRequest,
  fileDiffs: ChangedFile[],
  comments: Comment[],
  owner: string,
  repo: string
): string {
  let markdown = `# Pull Request #${pr.number}: ${pr.title}\n\n`;

  // Basic PR info
  markdown += '<metadata>\n';
  markdown += `Repository: ${owner}/${repo}\n`;
  markdown += `State: ${pr.state}\n`;
  markdown += `Author: ${pr.author.login}\n`;
  markdown += `Created: ${new Date(pr.createdAt).toLocaleDateString()}\n`;
  markdown += `Updated: ${new Date(pr.updatedAt).toLocaleDateString()}\n`;
  markdown += `Branch: ${pr.head.ref} → ${pr.base.ref}\n`;
  markdown += `URL: ${pr.url}\n`;
  markdown += '</metadata>\n\n';

  // Description
  if (pr.body) {
    markdown += `<description>\n${pr.body}\n</description>\n\n`;
  }

  // File changes summary
  markdown += '<files>\n';
  if (fileDiffs.length > 0) {
    for (const fileDiff of fileDiffs) {
      markdown += `${fileDiff.path} (+${fileDiff.additions}/-${fileDiff.deletions})\n`;
      if (fileDiff.commit_messages.length > 0) {
        const uniqueMessages = [...new Set(fileDiff.commit_messages)];
        for (const message of uniqueMessages) {
          markdown += `  - ${message.split('\n')[0]}\n`;
        }
      }
    }
  }
  markdown += '</files>\n\n';

  // Comments section
  if (comments.length > 0) {
    markdown += '<comments>\n';

    const sorted = [...comments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const comment of sorted) {
      const date = new Date(comment.createdAt).toLocaleDateString();
      const author = comment.author.login;

      if (comment.type === 'review_summary') {
        markdown += `[review_summary] user:${author} comment_id:${comment.id} (${date})\n`;
      } else if (comment.type === 'review') {
        const lineInfo = comment.line ? `:${comment.line}` : '';
        markdown += `[review_comment] user:${author} on ${comment.path}${lineInfo} comment_id:${comment.id} (${date})\n`;
      } else {
        markdown += `[issue_comment] user:${author} comment_id:${comment.id} (${date})\n`;
      }

      markdown += `${comment.body}\n`;

      if (comment.reactions && comment.reactions.length > 0) {
        const reactionCounts = new Map<string, number>();
        for (const r of comment.reactions) {
          reactionCounts.set(r.content, (reactionCounts.get(r.content) || 0) + 1);
        }
        const parts: string[] = [];
        for (const [emoji, count] of reactionCounts) {
          parts.push(count > 1 ? `${emoji} x${count}` : emoji);
        }
        markdown += `reactions: ${parts.join(', ')}\n`;
      }

      markdown += '\n';
    }
    markdown += '</comments>\n';
  }

  return markdown;
}

// File update operations interfaces and functions
export interface LLMUpdateOperation {
  operation: 'replace_lines' | 'insert_after' | 'insert_before' | 'delete_lines';
  lineStart: number; // 1-indexed
  lineEnd?: number; // 1-indexed, inclusive, required for 'replace_lines' and 'delete_lines'
  content?: string; // New content to insert/replace
}

/**
 * Validates that line numbers are within valid range
 */
export function validateLineNumbers(startLine: number, endLine: number, totalLines: number): void {
  if (startLine < 1 || endLine > totalLines) {
    throw new Error(`Line numbers out of range: ${startLine}-${endLine}`);
  }
  if (startLine > endLine) {
    throw new Error(`Invalid line range: ${startLine} > ${endLine}`);
  }
}

export async function getFilePathsInRepo(
  githubClient: Octokit,
  owner: string,
  repo: string,
  path = ''
): Promise<string[]> {
  const filePaths: string[] = [];

  try {
    const response = await githubClient.rest.repos.getContent({
      owner,
      repo,
      path,
    });

    // Handle array response (directory contents)
    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        // Skip dot files and folders
        if (
          item.path.trimStart().startsWith('.') ||
          item.path.includes('[') ||
          item.path.includes(']') ||
          item.path.includes('__tests__')
        ) {
          continue;
        }
        if (item.type === 'file') {
          filePaths.push(item.path);
        } else if (item.type === 'dir') {
          // Recursively get files from subdirectories
          console.log(`Getting files from subdirectory: ${item.path}`);
          const subDirFiles = await getFilePathsInRepo(githubClient, owner, repo, item.path);
          filePaths.push(...subDirFiles);
        }
      }
    } else if (response.data.type === 'file') {
      // Handle single file response
      filePaths.push(response.data.path);
    }

    return filePaths;
  } catch (error) {
    throw new Error(
      `Failed to get file paths from repository: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Apply the operations to the document.
 *
 * Operations are applied in reverse order (by line number) to avoid
 * line number shifts affecting subsequent operations.
 */
export function applyOperations(fileContent: string, operations: LLMUpdateOperation[]): string {
  if (!operations || operations.length === 0) {
    return fileContent;
  }

  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  // Sort operations by line number in descending order to avoid line shifts
  const sortedOperations = operations.sort((a, b) => {
    const aStart = a.lineStart || 0;
    const aEnd = a.lineEnd || 0;
    const bStart = b.lineStart || 0;
    const bEnd = b.lineEnd || 0;
    return bStart - aStart || bEnd - aEnd;
  });

  for (const operation of sortedOperations) {
    try {
      switch (operation.operation) {
        case 'replace_lines': {
          if (!operation.lineStart || !operation.lineEnd || operation.content === undefined) {
            throw new Error('replace_lines requires lineStart, lineEnd, and content');
          }

          // Validate line numbers
          validateLineNumbers(operation.lineStart, operation.lineEnd, totalLines);

          // Replace lines (1-indexed to 0-indexed conversion)
          const startIdx = operation.lineStart - 1;
          const endIdx = operation.lineEnd; // end_idx is exclusive in slice for splice

          // Split content into lines
          const newLines = operation.content.split('\n');
          lines.splice(startIdx, endIdx - startIdx, ...newLines);
          break;
        }

        case 'insert_after': {
          if (!operation.lineStart || operation.content === undefined) {
            throw new Error('insert_after requires lineStart and content');
          }

          if (operation.lineStart < 1 || operation.lineStart > totalLines) {
            throw new Error(`Line number out of range: ${operation.lineStart}`);
          }

          // Insert after the specified line
          const insertIdx = operation.lineStart; // Insert after lineStart
          const newLines = operation.content.split('\n');
          lines.splice(insertIdx, 0, ...newLines);
          break;
        }

        case 'insert_before': {
          if (!operation.lineStart || operation.content === undefined) {
            throw new Error('insert_before requires lineStart and content');
          }

          if (operation.lineStart < 1 || operation.lineStart > totalLines) {
            throw new Error(`Line number out of range: ${operation.lineStart}`);
          }

          // Insert before the specified line
          const insertIdx = operation.lineStart - 1; // Insert before lineStart
          const newLines = operation.content.split('\n');
          lines.splice(insertIdx, 0, ...newLines);
          break;
        }

        case 'delete_lines': {
          if (!operation.lineStart || !operation.lineEnd) {
            throw new Error('delete_lines requires lineStart and lineEnd');
          }

          validateLineNumbers(operation.lineStart, operation.lineEnd, totalLines);

          // Delete lines (1-indexed to 0-indexed conversion)
          const startIdx = operation.lineStart - 1;
          const deleteCount = operation.lineEnd - operation.lineStart + 1;
          lines.splice(startIdx, deleteCount);
          break;
        }

        default:
          throw new Error(`Unknown operation: ${operation.operation}`);
      }
    } catch (error) {
      // Log the error but continue with other operations
      console.error(
        `Error applying operation ${operation.operation}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Create updated content
  const updatedContent = lines.join('\n');
  return updatedContent;
}

/**
 * Convenience function to apply a single operation to file content
 */
export function applyOperation(fileContent: string, operation: LLMUpdateOperation): string {
  return applyOperations(fileContent, [operation]);
}

/**
 * Apply a list of operations to a piece of documentation and return a mapping of line number to line content.
 * This function is useful for visualizing what the operations would do before applying them.
 *
 * @param fileContent - The original content of the file
 * @param operations - A list of operations to apply to the file
 * @returns A mapping of line number to line content, or an error message string if operations fail
 */
export function visualizeUpdateOperations(
  fileContent: string,
  operations: LLMUpdateOperation[]
): Record<number, string> | string {
  try {
    const updatedContent = applyOperations(fileContent, operations);
    const lines = updatedContent.split('\n');
    const outputMapping: Record<number, string> = {};

    for (let i = 0; i < lines.length; i++) {
      outputMapping[i + 1] = lines[i]; // 1-indexed line numbers
    }

    return outputMapping;
  } catch (error) {
    return `Error applying operations: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function commitContent({
  githubClient,
  owner,
  repo,
  filePath,
  branchName,
  content,
  commitMessage,
}: {
  githubClient: Octokit;
  owner: string;
  repo: string;
  filePath: string;
  branchName: string;
  content: string;
  commitMessage: string;
}): Promise<string> {
  const branchRef = await githubClient.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  });

  const currentSha = branchRef.data.object.sha;

  const currentCommit = await githubClient.rest.git.getCommit({
    owner,
    repo,
    commit_sha: currentSha,
  });

  const currentTreeSha = currentCommit.data.tree.sha;

  const blob = await githubClient.rest.git.createBlob({
    owner,
    repo,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  });

  const newTree = await githubClient.rest.git.createTree({
    owner,
    repo,
    base_tree: currentTreeSha,
    tree: [
      {
        path: filePath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.data.sha,
      },
    ],
  });

  const newCommit = await githubClient.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.data.sha,
    parents: [currentSha],
  });

  await githubClient.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.data.sha,
  });

  return newCommit.data.sha;
}

export async function commitFileChanges({
  githubClient,
  owner,
  repo,
  fileContent,
  filePath,
  branchName,
  operations,
  commitMessage,
}: {
  githubClient: Octokit;
  owner: string;
  repo: string;
  fileContent: string;
  filePath: string;
  branchName: string;
  operations: LLMUpdateOperation[];
  commitMessage: string;
}): Promise<string> {
  try {
    const updatedContent = applyOperations(fileContent, operations);
    return await commitContent({
      githubClient,
      owner,
      repo,
      filePath,
      branchName,
      content: updatedContent,
      commitMessage,
    });
  } catch (error) {
    throw new Error(
      `Error committing file changes: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function commitNewFile({
  githubClient,
  owner,
  repo,
  filePath,
  branchName,
  content,
  commitMessage,
}: {
  githubClient: Octokit;
  owner: string;
  repo: string;
  filePath: string;
  branchName: string;
  content: string;
  commitMessage: string;
}): Promise<string> {
  try {
    return await commitContent({
      githubClient,
      owner,
      repo,
      filePath,
      branchName,
      content,
      commitMessage,
    });
  } catch (error) {
    throw new Error(
      `Failed to commit new file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function createIssueCommentReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  content: ReactionContent
): Promise<{ id: number; content: string }> {
  const { data } = await octokit.rest.reactions.createForIssueComment({
    owner,
    repo,
    comment_id: commentId,
    content,
  });
  return { id: data.id, content: data.content };
}

export async function deleteIssueCommentReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  reactionId: number
): Promise<void> {
  await octokit.rest.reactions.deleteForIssueComment({
    owner,
    repo,
    comment_id: commentId,
    reaction_id: reactionId,
  });
}

export async function createPullRequestReviewCommentReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  content: ReactionContent
): Promise<{ id: number; content: string }> {
  const { data } = await octokit.rest.reactions.createForPullRequestReviewComment({
    owner,
    repo,
    comment_id: commentId,
    content,
  });
  return { id: data.id, content: data.content };
}

export async function deletePullRequestReviewCommentReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  reactionId: number
): Promise<void> {
  await octokit.rest.reactions.deleteForPullRequestComment({
    owner,
    repo,
    comment_id: commentId,
    reaction_id: reactionId,
  });
}

export interface ReactionDetail {
  id: number;
  content: ReactionContent;
  user: string;
  createdAt: string;
}

export async function listIssueCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number
): Promise<ReactionDetail[]> {
  const reactions: ReactionDetail[] = [];
  for await (const response of octokit.paginate.iterator(
    octokit.rest.reactions.listForIssueComment,
    { owner, repo, comment_id: commentId, per_page: 100 }
  )) {
    for (const r of response.data) {
      reactions.push({
        id: r.id,
        content: r.content as ReactionContent,
        user: r.user?.login ?? 'unknown',
        createdAt: r.created_at,
      });
    }
  }
  return reactions;
}

export async function listPullRequestReviewCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number
): Promise<ReactionDetail[]> {
  const reactions: ReactionDetail[] = [];
  for await (const response of octokit.paginate.iterator(
    octokit.rest.reactions.listForPullRequestReviewComment,
    { owner, repo, comment_id: commentId, per_page: 100 }
  )) {
    for (const r of response.data) {
      reactions.push({
        id: r.id,
        content: r.content as ReactionContent,
        user: r.user?.login ?? 'unknown',
        createdAt: r.created_at,
      });
    }
  }
  return reactions;
}

export async function listIssueReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<ReactionDetail[]> {
  const reactions: ReactionDetail[] = [];
  for await (const response of octokit.paginate.iterator(octokit.rest.reactions.listForIssue, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  })) {
    for (const r of response.data) {
      reactions.push({
        id: r.id,
        content: r.content as ReactionContent,
        user: r.user?.login ?? 'unknown',
        createdAt: r.created_at,
      });
    }
  }
  return reactions;
}

export async function formatFileDiff(
  pullRequestNumber: number,
  files: ChangedFile[],
  includeContents: boolean = false
): Promise<string> {
  let output = `## File Patches for PR #${pullRequestNumber}\n\n`;
  output += `Found ${files.length} file(s) matching the requested paths.\n\n`;

  for (const file of files) {
    output += `### ${file.path}\n`;
    output += `**Status:** ${file.status} | **+${file.additions}** / **-${file.deletions}**\n\n`;

    if (file.patch) {
      output += '```diff\n';
      output += file.patch;
      output += '\n```\n\n';
    } else {
      output += '_No patch available (file may be binary or too large)_\n\n';
    }

    if (includeContents && file.contents) {
      output += '<details>\n<summary>Full file contents</summary>\n\n';
      output += '```\n';
      output += file.contents;
      output += '\n```\n\n</details>\n\n';
    }
  }

  return output;
}
