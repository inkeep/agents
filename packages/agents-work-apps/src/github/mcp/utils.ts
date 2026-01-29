import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { env } from '../../env';
import { getLogger } from '../../logger';

const logger = getLogger('github-mcp-utils');

// Define interfaces for GitHub data structures
export interface GithubFileDiffs {
  commit_messages: string[];
  diff: string;
  filename: string;
  additions: number;
  deletions: number;
}

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

export interface PullRequestFile {
  filename: string;
  patch?: string;
  additions?: number;
  deletions?: number;
  status: string;
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

/**
 * GitHub helper functions using Octokit
 */
export class GitHubHelpers {
  private octokit: Octokit;

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Fetch detailed information about a pull request.
   */
  async getPrInfo(owner: string, repo: string, prNumber: number) {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to get PR info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch all commits in a pull request.
   */
  async getPrCommits(owner: string, repo: string, prNumber: number) {
    try {
      const commits: PullCommit[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.octokit.rest.pulls.listCommits({
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
  async getCommitDetails(owner: string, repo: string, commitSha: string) {
    try {
      const response = await this.octokit.rest.repos.getCommit({
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
   * Fetch the diff for a specific commit.
   */
  async getCommitDiff(
    owner: string,
    repo: string,
    commitSha: string,
    format: 'diff' | 'patch' = 'diff'
  ): Promise<string> {
    try {
      const mediaType =
        format === 'patch' ? 'application/vnd.github.v3.patch' : 'application/vnd.github.v3.diff';

      const response = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner,
        repo,
        ref: commitSha,
        headers: {
          accept: mediaType,
        },
      });

      return response.data as unknown as string;
    } catch (error) {
      throw new Error(
        `Failed to get commit diff: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get files changed in a pull request.
   */
  async getPrFiles(owner: string, repo: string, prNumber: number): Promise<PullRequestFile[]> {
    try {
      const files: PullRequestFile[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: prNumber,
          per_page: perPage,
          page,
        });

        files.push(
          ...response.data.map((file) => ({
            filename: file.filename,
            patch: file.patch,
            additions: file.additions,
            deletions: file.deletions,
            status: file.status,
          }))
        );

        if (response.data.length < perPage) {
          break;
        }
        page++;
      }

      return files;
    } catch (error) {
      throw new Error(
        `Failed to get PR files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get file-based diffs with all commit messages that impacted each file.
   */
  async getPrFileDiffs(owner: string, repo: string, prNumber: number): Promise<GithubFileDiffs[]> {
    try {
      // Get all commits in the PR
      const commits = await this.getPrCommits(owner, repo, prNumber);

      // Get the final PR files to know what files to include
      const prFiles = await this.getPrFiles(owner, repo, prNumber);

      // Group commits by file
      const fileToCommits: Record<string, CommitData[]> = {};

      for (const commit of commits) {
        const commitSha = commit.sha;
        const commitDetails = await this.getCommitDetails(owner, repo, commitSha);
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
      const fileDiffs: GithubFileDiffs[] = [];

      for (const prFile of prFiles) {
        const filename = prFile.filename;

        if (filename in fileToCommits) {
          // Get all commit messages for this file
          const commitMessages = fileToCommits[filename].map(
            (commitData) => commitData.commit_message
          );

          // Get the current diff for this file from the PR
          if (prFile.patch) {
            const diff = prFile.patch;

            // Use the final PR file stats for additions/deletions
            const additions = prFile.additions || 0;
            const deletions = prFile.deletions || 0;

            const githubFileDiff: GithubFileDiffs = {
              commit_messages: commitMessages,
              diff,
              filename,
              additions,
              deletions,
            };

            fileDiffs.push(githubFileDiff);
          }
        }
      }

      return fileDiffs;
    } catch (error) {
      throw new Error(
        `Failed to get PR file diffs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// Standalone helper functions that can be used without the class
export const createGitHubHelpers = (octokit: Octokit) => new GitHubHelpers(octokit);

// Individual function exports for convenience
export const getPrInfo = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) => {
  const helpers = new GitHubHelpers(octokit);
  return helpers.getPrInfo(owner, repo, prNumber);
};

export const getPrCommits = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) => {
  const helpers = new GitHubHelpers(octokit);
  return helpers.getPrCommits(owner, repo, prNumber);
};

export const getPrFiles = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) => {
  const helpers = new GitHubHelpers(octokit);
  return helpers.getPrFiles(owner, repo, prNumber);
};

export const getPrFileDiffs = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) => {
  const helpers = new GitHubHelpers(octokit);
  return helpers.getPrFileDiffs(owner, repo, prNumber);
};

/**
 * Generate a markdown representation of a pull request with file diffs
 */
export const generatePrMarkdown = (
  prInfo: Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data'],
  fileDiffs: GithubFileDiffs[],
  owner: string,
  repo: string
): string => {
  const pr = prInfo;

  let markdown = `# Pull Request #${pr.number}: ${pr.title}\n\n`;

  // Basic PR info
  markdown += `**Repository:** ${owner}/${repo}\n`;
  markdown += `**State:** ${pr.state}\n`;
  markdown += `**Author:** ${pr.user?.login || 'Unknown'}\n`;
  markdown += `**Created:** ${new Date(pr.created_at).toLocaleDateString()}\n`;
  markdown += `**Updated:** ${new Date(pr.updated_at).toLocaleDateString()}\n\n`;

  // Branches
  markdown += '## Branches\n';
  markdown += `- **From:** \`${pr.head.ref}\` (${pr.head.repo?.full_name || 'fork'})\n`;
  markdown += `- **To:** \`${pr.base.ref}\` (${pr.base.repo?.full_name || `${owner}/${repo}`})\n\n`;

  // URL
  markdown += `**URL:** ${pr.html_url}\n\n`;

  // Description
  if (pr.body) {
    markdown += `## Description\n${pr.body}\n\n`;
  } else {
    markdown += '## Description\n_No description provided._\n\n';
  }

  // File changes summary
  if (fileDiffs.length > 0) {
    const totalAdditions = fileDiffs.reduce((sum, file) => sum + file.additions, 0);
    const totalDeletions = fileDiffs.reduce((sum, file) => sum + file.deletions, 0);

    markdown += '## Changes Summary\n';
    markdown += `- **Files changed:** ${fileDiffs.length}\n`;
    markdown += `- **Additions:** +${totalAdditions}\n`;
    markdown += `- **Deletions:** -${totalDeletions}\n\n`;

    // Files changed
    markdown += '## Files Changed\n';
    for (const fileDiff of fileDiffs) {
      markdown += `### ${fileDiff.filename}\n`;
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

      // Diff
      if (fileDiff.diff) {
        markdown += '\n**Diff:**\n';
        markdown += `\`\`\`diff\n${fileDiff.diff}\n\`\`\`\n`;
      }

      markdown += '\n';
    }
  }

  return markdown;
};

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
    // Get the current branch reference
    const branchRef = await githubClient.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });

    const currentSha = branchRef.data.object.sha;

    // Get the current commit to get the tree SHA
    const currentCommit = await githubClient.rest.git.getCommit({
      owner,
      repo,
      commit_sha: currentSha,
    });

    const currentTreeSha = currentCommit.data.tree.sha;
    const updatedContent = applyOperations(fileContent, operations);

    // Create blob for the updated file
    const blob = await githubClient.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(updatedContent).toString('base64'),
      encoding: 'base64',
    });

    const fileBlobs = [
      {
        path: filePath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.data.sha,
      },
    ];

    // Create a new tree
    const newTree = await githubClient.rest.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: fileBlobs,
    });

    // Create the commit
    const newCommit = await githubClient.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.data.sha,
      parents: [currentSha],
    });

    // Update the branch reference
    await githubClient.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
      sha: newCommit.data.sha,
    });

    return newCommit.data.sha;
  } catch (error) {
    throw new Error(
      `Error committing file changes: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
