import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { minimatch } from 'minimatch';
import { env } from '../../env';
import { getLogger } from '../../logger';
import type { ChangedFile, GitHubUser, PullRequest } from './schemas';

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

function mapUser(user: {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}): GitHubUser {
  return {
    login: user.login,
    id: user.id,
    avatarUrl: user.avatar_url,
    url: user.html_url,
  };
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

  const files: ChangedFile[] = [];

  const pullRequest = await fetchPrInfo(octokit, owner, repo, prNumber);
  const headSha = pullRequest.head.sha;

  // Paginate through all changed files
  for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })) {
    for (const file of response.data) {
      // Apply path filter if specified
      if (
        pathFilters.length > 0 &&
        !pathFilters.some((filter) => minimatch(file.filename, filter))
      ) {
        continue;
      }

      const changedFile: ChangedFile = {
        commit_messages: [],
        path: file.filename,
        status: file.status as ChangedFile['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: includePatch ? file.patch : undefined,
        previousPath: file.previous_filename,
      };

      // Fetch file contents if requested and file wasn't deleted
      if (includeContents && file.status !== 'removed') {
        try {
          const { data: content } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.filename,
            ref: headSha,
          });

          if ('content' in content && content.encoding === 'base64') {
            changedFile.contents = Buffer.from(content.content, 'base64').toString('utf-8');
          }
        } catch (error) {
          logger.warn(
            { owner, repo, prNumber, headSha, file },
            `Failed to fetch contents for ${file.filename}: ${error}`
          );
        }
      }

      files.push(changedFile);
    }
  }

  logger.info(
    { owner, repo, prNumber, headSha, pathFilters, includeContents, files },
    `Found ${files.length} changed files${pathFilters.length > 0 ? ` matching "${pathFilters.join(', ')}"` : ''}`
  );

  return files;
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
    // Get all commits in the PR
    const commits = await fetchPrCommits(octokit, owner, repo, prNumber);

    // Get the final PR files to know what files to include
    const prFiles = await fetchPrFiles(octokit, owner, repo, prNumber);

    // Group commits by file
    const fileToCommits: Record<string, CommitData[]> = {};

    for (const commit of commits) {
      const commitSha = commit.sha;
      const commitDetails = await fetchCommitDetails(octokit, owner, repo, commitSha);
      const commitMessage = commit.commit.message;

      // For each file modified in this commit
      for (const fileInfo of commitDetails.files || []) {
        const filename = fileInfo.filename;

        if (!fileToCommits[filename]) {
          fileToCommits[filename] = [];
        }

        fileToCommits[filename].push({
          commit_sha: commitSha,
          commit_message: commitMessage,
          file_info: fileInfo,
        });
      }
    }

    // Build GithubFileDiffs objects
    const fileDiffs: ChangedFile[] = [];

    for (const prFile of prFiles) {
      const filename = prFile.path;

      if (filename in fileToCommits) {
        // Get all commit messages for this file
        const commitMessages = fileToCommits[filename].map(
          (commitData) => commitData.commit_message
        );

        const diff = prFile.patch;

        // Use the final PR file stats for additions/deletions
        const additions = prFile.additions || 0;
        const deletions = prFile.deletions || 0;

        const githubFileDiff: ChangedFile = {
          commit_messages: commitMessages,
          path: filename,
          status: prFile.status,
          additions,
          deletions,
          patch: diff,
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
 * Generate a markdown representation of a pull request with file diffs
 */
export function generatePrMarkdown(
  pr: PullRequest,
  fileDiffs: ChangedFile[],
  owner: string,
  repo: string
): string {
  let markdown = `# Pull Request #${pr.number}: ${pr.title}\n\n`;

  // Basic PR info
  markdown += `**Repository:** ${owner}/${repo}\n`;
  markdown += `**State:** ${pr.state}\n`;
  markdown += `**Author:** ${pr.author.login}\n`;
  markdown += `**Created:** ${new Date(pr.createdAt).toLocaleDateString()}\n`;
  markdown += `**Updated:** ${new Date(pr.updatedAt).toLocaleDateString()}\n\n`;

  // Branches
  markdown += '## Branches\n';
  markdown += `- **From:** \`${pr.head.ref}\`\n`;
  markdown += `- **To:** \`${pr.base.ref}\` (${owner}/${repo})\n\n`;

  // URL
  markdown += `**URL:** ${pr.url}\n\n`;

  // Description
  if (pr.body) {
    markdown += `## Description\n${pr.body}\n\n`;
  } else {
    markdown += '## Description\n_No description provided._\n\n';
  }

  // File changes summary
  if (fileDiffs.length > 0) {
    // Files changed
    markdown += '## Files Changed\n';
    for (const fileDiff of fileDiffs) {
      markdown += `### ${fileDiff.path}\n`;
      markdown += `- **Additions:** +${fileDiff.additions}\n`;
      markdown += `- **Deletions:** -${fileDiff.deletions}\n`;

      // Commit messages for this file
      if (fileDiff.commit_messages.length > 0) {
        markdown += '- **Related commits:**\n';
        const uniqueMessages = [...new Set(fileDiff.commit_messages)];
        for (const message of uniqueMessages) {
          markdown += `  - ${message.split('\n')[0]}\n`; // First line only
        }
      }

      markdown += '\n';
    }
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
