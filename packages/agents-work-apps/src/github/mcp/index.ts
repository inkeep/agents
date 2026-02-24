import { z } from '@hono/zod-openapi';
import {
  getMcpToolRepositoryAccessWithDetails,
  type WorkAppGitHubRepositorySelect,
} from '@inkeep/agents-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Octokit } from '@octokit/rest';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { Hono } from 'hono';
import runDbClient from '../../db/runDbClient';
import { githubMcpAuth } from './auth';
import { ReactionContentSchema } from './schemas';
import {
  commitFileChanges,
  commitNewFile,
  createIssueCommentReaction,
  createPullRequestReviewCommentReaction,
  deleteIssueCommentReaction,
  deletePullRequestReviewCommentReaction,
  fetchBranchChangedFiles,
  fetchComments,
  fetchPrFileDiffs,
  fetchPrFiles,
  fetchPrInfo,
  formatFileDiff,
  generatePrMarkdown,
  getGitHubClientFromRepo,
  type LLMUpdateOperation,
  listIssueCommentReactions,
  listPullRequestReviewCommentReactions,
  visualizeUpdateOperations,
} from './utils';

const updateOperationSchema = z
  .object({
    operation: z
      .enum(['replace_lines', 'insert_after', 'insert_before', 'delete_lines'])
      .describe('Operation type'),
    lineStart: z.number().min(1).describe('Starting line number (1-indexed)'),
    lineEnd: z
      .number()
      .min(1)
      .optional()
      .describe(
        "Ending line number (1-indexed, inclusive). Required for 'replace_lines' and 'delete_lines'"
      ),
    content: z.string().optional().describe('New content to insert/replace'),
    reason: z.string().describe('Explanation of why this change is needed'),
  })
  .describe('Update operation to apply to a file');

type UpdateOperation = z.infer<typeof updateOperationSchema>;

const updateOperationsSchema = z
  .array(updateOperationSchema)
  .describe('List of update operations to apply to a file');

const getAvailableRepositoryString = (repositoryAccess: WorkAppGitHubRepositorySelect[]) => {
  if (repositoryAccess.length === 0) {
    return 'No repositories available';
  }
  return `Available repositories: ${repositoryAccess.map((r) => `"${r.repositoryFullName}"`).join(', ')}`;
};

/**
 * Creates and configures an MCP server for the given context
 */
const getServer = async (toolId: string) => {
  // Initialize GitHub App authentication

  const repositoryAccess = await getMcpToolRepositoryAccessWithDetails(runDbClient)(toolId);
  const installationIdMap = new Map<string, string>();
  for (const repo of repositoryAccess) {
    installationIdMap.set(repo.repositoryFullName, repo.installationId);
  }

  if (repositoryAccess.length === 0) {
    throw new Error('No repository access found for tool');
  }

  const server = new McpServer(
    {
      name: 'inkeep-github-mcp-server',
      version: '1.0.0',
      description:
        'A GitHub MCP server with access to the following repositories:\n' +
        repositoryAccess.map((r) => `• ${r.repositoryFullName}`).join('\n'),
    },
    { capabilities: { logging: {} } }
  );

  // Register GitHub file search tool
  server.tool(
    'search-files-in-repo',
    `Find files in a repository using GitHub's search API. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('The owner of the repository'),
      repo: z.string().describe('The name of the repository'),
      query: z.string().describe('The query to search for'),
      path: z
        .string()
        .optional()
        .describe('The path to the files to search in relative to the root of the repository'),
      limit: z.number().default(30).describe('The maximum number of files to return'),
    },
    async ({ owner, repo, query, path, limit }) => {
      try {
        const repoFullName = `${owner}/${repo}`;
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        // Build search query
        let searchQuery = `${query} repo:${repoFullName}`;
        if (path) {
          searchQuery += ` path:${path}`;
        }

        // Search for files using GitHub's search API
        const response = await githubClient.rest.search.code({
          q: searchQuery,
          per_page: Math.min(limit, 100), // GitHub API limits to 100
        });

        const files = response.data.items.map((item) => ({
          name: item.name,
          path: item.path,
          url: item.html_url,
          repository: repoFullName,
          sha: item.sha,
          score: item.score,
        }));

        return {
          content: [
            {
              type: 'text',
              text: `Found ${files.length} files matching "${query}" in ${repoFullName}:\n\n${files
                .map(
                  (file) =>
                    `• ${file.name} (${file.path})\n  URL: ${file.url}\n  Score: ${file.score}`
                )
                .join('\n\n')}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & {
            status: number;
            response?: { headers?: Record<string, string> };
          };
          if (apiError.status === 403 || apiError.status === 429) {
            const retryAfter = apiError.response?.headers?.['retry-after'];
            const resetHeader = apiError.response?.headers?.['x-ratelimit-reset'];
            let waitMessage = '';
            if (retryAfter) {
              waitMessage = ` Try again in ${retryAfter} seconds.`;
            } else if (resetHeader) {
              const resetTime = new Date(Number(resetHeader) * 1000);
              waitMessage = ` Rate limit resets at ${resetTime.toISOString()}.`;
            }
            return {
              content: [
                {
                  type: 'text',
                  text: `GitHub Search API rate limit exceeded.${waitMessage} The search API is limited to 30 requests per minute. Please wait before retrying.`,
                },
              ],
              isError: true,
            };
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: `Error searching files: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register GitHub file content tool
  server.tool(
    'get-file-content',
    `Get the content of a specific file from a repository. Returns a mapping of line number to line content. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      file_path: z
        .string()
        .describe('Path to the file. the path is relative to the root of the repository'),
      branch_name: z
        .string()
        .optional()
        .describe(
          'The name of the branch to get the file content for (defaults to master/main branch). If you are analyzing a pr you created, you should use the branch name from the pr.'
        ),
      include_line_numbers: z
        .boolean()
        .optional()
        .describe('Whether to include line numbers in the response (defaults to false)'),
    },
    async ({ owner, repo, file_path, branch_name, include_line_numbers = false }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        // Get file content using GitHub's contents API
        const response = await githubClient.rest.repos.getContent({
          owner,
          repo,
          path: file_path,
          ref: branch_name,
        });
        if ('content' in response.data && !Array.isArray(response.data)) {
          if (include_line_numbers) {
            // Handle single file response
            const fileData = response.data;
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const lines = content.split('\n');
            const output_mapping = lines.map((line, index) => ({
              line: index + 1,
              content: line,
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(output_mapping),
                },
              ],
            };
          }
          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        }

        // Handle directory or other cases
        return {
          content: [
            {
              type: 'text',
              text: `The path "${file_path}" is not a file or could not be retrieved as file content.`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting file content: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
  server.tool(
    'get-pull-request-details',
    `Get the details of a pull request from a repository including the pull request details, the commits, and the files that were changed. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      pull_request_number: z.number().describe('Pull request number'),
    },
    async ({ owner, repo, pull_request_number }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
        const [pr, fileDiffs, comments] = await Promise.all([
          fetchPrInfo(githubClient, owner, repo, pull_request_number),
          fetchPrFileDiffs(githubClient, owner, repo, pull_request_number),
          fetchComments(githubClient, owner, repo, pull_request_number),
        ]);

        const markdown = generatePrMarkdown(pr, fileDiffs, comments, owner, repo);

        return {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        };
      } catch (error) {
        // Handle specific GitHub API errors
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Pull request #${pull_request_number} not found in ${owner}/${repo}. Please check the repository exists and the pull request number is correct.`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 403) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Access denied to pull request #${pull_request_number} in ${owner}/${repo}. Your GitHub App may not have sufficient permissions.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error getting pull request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get-file-patches',
    `Get the patch/diff text for specific files in a pull request. Use this to fetch detailed changes for one or more files without retrieving the entire PR. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      pull_request_number: z.number().describe('Pull request number'),
      file_paths: z
        .array(z.string())
        .min(1)
        .describe('List of file paths to get patches for (exact paths or glob patterns)'),
      include_contents: z
        .boolean()
        .default(false)
        .describe('Whether to include full file contents in addition to patches'),
    },
    async ({ owner, repo, pull_request_number, file_paths, include_contents }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const results = await fetchPrFiles(
          githubClient,
          owner,
          repo,
          pull_request_number,
          file_paths,
          include_contents,
          true
        );

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No files found matching the specified paths in PR #${pull_request_number}.\n\nRequested paths: ${file_paths.join(', ')}`,
              },
            ],
          };
        }

        const output = await formatFileDiff(pull_request_number, results, include_contents);

        return {
          content: [
            {
              type: 'text',
              text: output,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Pull request #${pull_request_number} not found in ${owner}/${repo}.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error getting file patches: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get-changed-files-for-branch',
    `Get the list of files changed on a branch compared to a base ref, without requiring a pull request. Returns file paths, status, additions/deletions, and optionally patches and full file contents. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      head: z.string().describe('The branch or ref to check for changes (e.g. "feat/my-feature")'),
      base: z
        .string()
        .optional()
        .describe(
          'The base branch or ref to compare against (defaults to the repository default branch)'
        ),
      file_paths: z
        .array(z.string())
        .optional()
        .describe('Optional list of file path glob patterns to filter results'),
      include_contents: z
        .boolean()
        .default(false)
        .describe('Whether to include full file contents for each changed file'),
      include_patch: z
        .boolean()
        .default(false)
        .describe('Whether to include the patch/diff text for each changed file'),
    },
    async ({ owner, repo, head, base, file_paths, include_contents, include_patch }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const baseRef =
          base ?? (await githubClient.rest.repos.get({ owner, repo })).data.default_branch;

        const files = await fetchBranchChangedFiles(githubClient, owner, repo, baseRef, head, {
          pathFilters: file_paths ?? [],
          includeContents: include_contents,
          includePatch: include_patch,
        });

        if (files.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No changed files found between ${baseRef} and ${head} in ${owner}/${repo}.${file_paths?.length ? `\n\nFilters applied: ${file_paths.join(', ')}` : ''}`,
              },
            ],
          };
        }

        const output = await formatFileDiff(0, files, include_contents);
        const header = `## Changed files: ${baseRef}...${head} in ${owner}/${repo}\n\nFound ${files.length} changed file(s).\n\n`;

        return {
          content: [
            {
              type: 'text',
              text: header + output,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Repository ${owner}/${repo} not found, or one of the refs ("${base ?? 'default'}", "${head}") does not exist.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error fetching changed files: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register GitHub create branch tool
  server.tool(
    'create-branch',
    `Create a new branch in a repository. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      from_branch: z
        .string()
        .optional()
        .describe('Branch to create from (defaults to default branch)'),
    },
    async ({ owner, repo, from_branch }) => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const branch_name = `docs-writer-ai-update-${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}`;
      try {
        const githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);

        // First, get the repository to find the default branch if from_branch is not specified
        const repoInfo = await githubClient.rest.repos.get({
          owner,
          repo,
        });

        const sourceBranch = from_branch || repoInfo.data.default_branch;

        // Get the SHA of the source branch
        const sourceRef = await githubClient.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${sourceBranch}`,
        });

        const sourceSha = sourceRef.data.object.sha;

        // Create the new branch
        await githubClient.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branch_name}`,
          sha: sourceSha,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully created branch "${branch_name}" in ${owner}/${repo}`,
            },
          ],
        };
      } catch (error) {
        // Handle specific GitHub API errors
        if (error instanceof Error && 'status' in error) {
          const apiError = error;
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Branch "${branch_name}" already exists in ${owner}/${repo}`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Repository ${owner}/${repo} not found or source branch "${from_branch || 'default'}" does not exist`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error creating branch: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register GitHub commit files tool
  server.tool(
    'commit-file-changes',
    `Commit changes to a files in a repository. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      branch_name: z.string().describe('Branch to commit to'),
      file_path: z.string().describe('Path to the file to commit'),
      update_operations: updateOperationsSchema,
      commit_message: z.string().describe('Commit message'),
    },
    async ({ owner, repo, branch_name, file_path, update_operations, commit_message }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        // Get the current file content from the specified branch
        const fileResponse = await githubClient.rest.repos.getContent({
          owner,
          repo,
          path: file_path,
          ref: branch_name,
        });

        if (!('content' in fileResponse.data) || Array.isArray(fileResponse.data)) {
          throw new Error(`File ${file_path} not found or is not a file`);
        }

        // Decode the current file content
        const currentFileContent = Buffer.from(fileResponse.data.content, 'base64').toString(
          'utf-8'
        );

        // Convert operations to the correct format
        const updateOperations: LLMUpdateOperation[] = update_operations.map(
          (op: UpdateOperation) => ({
            operation: op.operation as
              | 'replace_lines'
              | 'insert_after'
              | 'insert_before'
              | 'delete_lines',
            lineStart: op.lineStart,
            lineEnd: op.lineEnd,
            content: op.content,
            reason: op.reason,
          })
        );

        await commitFileChanges({
          githubClient,
          owner,
          repo,
          fileContent: currentFileContent,
          filePath: file_path,
          branchName: branch_name,
          operations: updateOperations,
          commitMessage: commit_message,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully committed changes to ${owner}/${repo} on branch "${branch_name}"`,
            },
          ],
        };
      } catch (error) {
        // Handle specific GitHub API errors
        if (error instanceof Error && 'status' in error) {
          const apiError = error;
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Repository ${owner}/${repo} or branch "${branch_name}" not found`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Invalid commit data. Please check file path and update operations format.',
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error creating commit: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'commit-new-file',
    `Create and commit a new file in a repository. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      branch_name: z.string().describe('Branch to commit to'),
      file_path: z.string().describe('Path for the new file (relative to repository root)'),
      content: z.string().describe('Content for the new file'),
      commit_message: z.string().describe('Commit message'),
    },
    async ({ owner, repo, branch_name, file_path, content, commit_message }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const commitSha = await commitNewFile({
          githubClient,
          owner,
          repo,
          filePath: file_path,
          branchName: branch_name,
          content,
          commitMessage: commit_message,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully created and committed new file "${file_path}" to ${owner}/${repo} on branch "${branch_name}"\n\nCommit SHA: ${commitSha}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Repository ${owner}/${repo} or branch "${branch_name}" not found`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: `File "${file_path}" may already exist or the path is invalid.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error creating file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register GitHub create pull request tool
  server.tool(
    'create-pull-request',
    `Create a pull request in a repository. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      title: z.string().describe('Pull request title'),
      body: z.string().describe('Pull request description'),
      head_branch: z.string().describe('Branch containing the changes'),
      team_reviewers: z.array(z.string()).describe('Team reviewers to request reviews from'),
      user_reviewers: z.array(z.string()).describe('User reviewers to request reviews from'),
    },
    async ({ owner, repo, title, body, head_branch, team_reviewers, user_reviewers }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        // Get repository info to determine default branch if base_branch not provided
        const repoInfo = await githubClient.rest.repos.get({
          owner,
          repo,
        });

        const targetBaseBranch = repoInfo.data.default_branch;

        // Create the pull request
        const pullRequestResponse = await githubClient.rest.pulls.create({
          owner,
          repo,
          title,
          body,
          head: head_branch,
          base: targetBaseBranch,
          draft: false,
        });

        // Request reviewers if provided (non-fatal - PR is still created if this fails)
        if (user_reviewers?.length || team_reviewers?.length) {
          try {
            const reviewerParams: {
              owner: string;
              repo: string;
              pull_number: number;
              reviewers?: string[];
              team_reviewers?: string[];
            } = {
              owner,
              repo,
              pull_number: pullRequestResponse.data.number,
            };
            if (user_reviewers?.length) {
              reviewerParams.reviewers = user_reviewers;
            }
            if (team_reviewers?.length) {
              reviewerParams.team_reviewers = team_reviewers;
            }
            await githubClient.rest.pulls.requestReviewers(reviewerParams);
          } catch (reviewerError) {
            console.error('Error requesting reviewers:', reviewerError);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully created pull request in ${owner}/${repo}\n\nPull Request details:\n• Number: #${pullRequestResponse.data.number}\n• Title: ${title}\n• Head: ${head_branch}\n• Base: ${targetBaseBranch}\n• Status: Open\n• URL: ${pullRequestResponse.data.html_url}\n\nDescription:\n${body}`,
            },
          ],
        };
      } catch (error) {
        // Handle specific GitHub API errors
        if (error instanceof Error && 'status' in error) {
          const apiError = error;
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Repository ${owner}/${repo} not found or branch "${head_branch}" does not exist`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Pull request validation failed. This could be due to: no commits between branches, pull request already exists, or invalid branch names.',
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 403) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Permission denied. Your GitHub App may not have sufficient permissions to create pull requests in this repository.',
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error creating pull request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'leave-comment-on-pull-request',
    `Leave a comment on a pull request. This creates a general comment on the PR, not a line-specific review comment. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      pull_request_number: z.number().describe('Pull request number'),
      body: z.string().describe('The comment body text (supports GitHub markdown)'),
    },
    async ({ owner, repo, pull_request_number, body }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const commentResponse = await githubClient.rest.issues.createComment({
          owner,
          repo,
          issue_number: pull_request_number,
          body,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully posted comment on PR #${pull_request_number} in ${owner}/${repo}\n\nComment details:\n• ID: ${commentResponse.data.id}\n• URL: ${commentResponse.data.html_url}\n• Created at: ${commentResponse.data.created_at}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Pull request #${pull_request_number} not found in ${owner}/${repo}. Please check the repository exists and the pull request number is correct.`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 403) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Access denied to PR #${pull_request_number} in ${owner}/${repo}. Your GitHub App may not have sufficient permissions to comment on pull requests.`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Invalid comment data. Please check the comment body is not empty and is valid.',
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error posting comment: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'add-comment-reaction',
    `Add a reaction to a comment on a pull request. Supports general pull request comments and inline PR review comments. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      comment_id: z.number().describe('The ID of the comment to react to'),
      comment_type: z
        .enum(['issue_comment', 'review_comment'])
        .describe(
          'The type of comment: "issue_comment" for general pull request comments, "review_comment" for inline PR review comments'
        ),
      reaction: ReactionContentSchema.describe(
        'The reaction emoji to add: +1, -1, laugh, hooray, confused, heart, rocket, or eyes'
      ),
    },
    async ({ owner, repo, comment_id, comment_type, reaction }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const result =
          comment_type === 'issue_comment'
            ? await createIssueCommentReaction(githubClient, owner, repo, comment_id, reaction)
            : await createPullRequestReviewCommentReaction(
                githubClient,
                owner,
                repo,
                comment_id,
                reaction
              );

        return {
          content: [
            {
              type: 'text',
              text: `Successfully added ${reaction} reaction to ${comment_type} comment ${comment_id} in ${owner}/${repo}\n\nReaction ID: ${result.id}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Comment ${comment_id} not found in ${owner}/${repo}.`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 422) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Invalid reaction. Ensure the reaction type is valid and the comment exists.`,
                },
              ],
              isError: true,
            };
          }
          if (apiError.status === 403) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Access denied when adding reaction to comment ${comment_id} in ${owner}/${repo}. Your GitHub App may not have sufficient permissions to create reactions.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error adding reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'remove-comment-reaction',
    `Remove a reaction from a comment on a pull request. Requires the reaction ID (returned when adding a reaction or available from comment data). ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      comment_id: z.number().describe('The ID of the comment the reaction belongs to'),
      comment_type: z
        .enum(['issue_comment', 'review_comment'])
        .describe(
          'The type of comment: "issue_comment" for general pull request comments, "review_comment" for inline PR review comments'
        ),
      reaction_id: z.number().describe('The ID of the reaction to remove'),
    },
    async ({ owner, repo, comment_id, comment_type, reaction_id }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        if (comment_type === 'issue_comment') {
          await deleteIssueCommentReaction(githubClient, owner, repo, comment_id, reaction_id);
        } else {
          await deletePullRequestReviewCommentReaction(
            githubClient,
            owner,
            repo,
            comment_id,
            reaction_id
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed reaction ${reaction_id} from ${comment_type} comment ${comment_id} in ${owner}/${repo}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Comment ${comment_id} or reaction ${reaction_id} not found in ${owner}/${repo}.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error removing reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'list-comment-reactions',
    `List all reactions on a comment, including each reaction's ID (needed for removal). Supports both general issue/PR comments and inline PR review comments. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      comment_id: z.number().describe('The ID of the comment to list reactions for'),
      comment_type: z
        .enum(['issue_comment', 'review_comment'])
        .describe(
          'The type of comment: "issue_comment" for general pull request comments, "review_comment" for inline PR review comments'
        ),
    },
    async ({ owner, repo, comment_id, comment_type }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const reactions =
          comment_type === 'issue_comment'
            ? await listIssueCommentReactions(githubClient, owner, repo, comment_id)
            : await listPullRequestReviewCommentReactions(githubClient, owner, repo, comment_id);

        if (reactions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No reactions found on ${comment_type} comment ${comment_id} in ${owner}/${repo}.`,
              },
            ],
          };
        }

        const formatted = reactions
          .map((r) => `• ${r.content} by @${r.user} (reaction_id: ${r.id})`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${reactions.length} reaction(s) on ${comment_type} comment ${comment_id} in ${owner}/${repo}:\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && 'status' in error) {
          const apiError = error as Error & { status: number };
          if (apiError.status === 404) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Comment ${comment_id} not found in ${owner}/${repo}.`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error listing reactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register visualize update operations tool
  server.tool(
    'visualize-update-operations',
    `Apply a list of operations to a piece of documentation and return a mapping of line number to line content. ${getAvailableRepositoryString(repositoryAccess)}`,
    {
      owner: z.string().describe('Repository owner name'),
      repo: z.string().describe('Repository name'),
      file_path: z.string().describe('The path of the file to visualize the update operations for'),
      branch_name: z
        .string()
        .optional()
        .describe(
          'The name of the branch to visualize the update operations for (defaults to master/main branch). If you are modifying a pr you created, you should use the branch name from the pr.'
        ),
      operations: updateOperationsSchema,
    },
    async ({ owner, repo, file_path, branch_name, operations }) => {
      try {
        let githubClient: Octokit;
        try {
          githubClient = getGitHubClientFromRepo(owner, repo, installationIdMap);
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error accessing GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        // Get file content using GitHub's contents API
        const response = await githubClient.rest.repos.getContent({
          owner,
          repo,
          path: file_path,
          ref: branch_name,
        });

        // Handle single file response
        if ('content' in response.data && !Array.isArray(response.data)) {
          const fileData = response.data;
          const fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

          // Convert operations to the correct format
          const updateOperations: LLMUpdateOperation[] = operations.map((op: UpdateOperation) => ({
            operation: op.operation,
            lineStart: op.lineStart,
            lineEnd: op.lineEnd,
            content: op.content,
            reason: op.reason,
          }));

          // Apply operations and get visualization
          const result = visualizeUpdateOperations(fileContent, updateOperations);

          if (typeof result === 'string') {
            // Error occurred
            return {
              content: [
                {
                  type: 'text',
                  text: result,
                },
              ],
              isError: true,
            };
          }

          // Success - format the line mapping as readable text
          const formattedLines = Object.entries(result)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([lineNum, content]) => `${lineNum.padStart(3, ' ')}| ${content}`)
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `${formattedLines}`,
              },
            ],
          };
        }

        // Handle directory or other cases
        return {
          content: [
            {
              type: 'text',
              text: `The path "${file_path}" is not a file or could not be retrieved as file content.`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error visualizing update operations: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
};

const app = new Hono<{
  Variables: {
    toolId: string;
  };
}>();

app.use('/', githubMcpAuth());
app.post('/', async (c) => {
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    return c.json({ error: 'GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set' }, 500);
  }
  const toolId = c.get('toolId');
  const body = await c.req.json();

  const server = await getServer(toolId);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const { req, res } = toReqRes(c.req.raw);

  try {
    await transport.handleRequest(req, res, body);
    return toFetchResponse(res);
  } finally {
    await server.close();
  }
});

app.delete('/', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Method Not Allowed' },
      id: null,
    },
    { status: 405 }
  );
});

app.get('/', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    },
    { status: 405 }
  );
});

app.get('/health', async (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'GitHub MCP Server',
  });
});

export default app;
