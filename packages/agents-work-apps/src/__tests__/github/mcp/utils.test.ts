import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangedFile, Comment, PullRequest } from '../../../github/mcp/schemas';
import type { LLMUpdateOperation } from '../../../github/mcp/utils';

vi.mock('../../../env', () => ({
  env: {
    GITHUB_APP_ID: 'test-app-id',
    GITHUB_APP_PRIVATE_KEY: 'test-private-key',
  },
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('github mcp utils', () => {
  describe('validateLineNumbers', () => {
    let validateLineNumbers: typeof import('../../../github/mcp/utils').validateLineNumbers;

    beforeEach(async () => {
      ({ validateLineNumbers } = await import('../../../github/mcp/utils'));
    });

    it('should accept valid line ranges', () => {
      expect(() => validateLineNumbers(1, 5, 10)).not.toThrow();
      expect(() => validateLineNumbers(1, 1, 1)).not.toThrow();
      expect(() => validateLineNumbers(1, 10, 10)).not.toThrow();
      expect(() => validateLineNumbers(5, 5, 10)).not.toThrow();
    });

    it('should throw when startLine is less than 1', () => {
      expect(() => validateLineNumbers(0, 5, 10)).toThrow('Line numbers out of range: 0-5');
    });

    it('should throw when endLine exceeds totalLines', () => {
      expect(() => validateLineNumbers(1, 11, 10)).toThrow('Line numbers out of range: 1-11');
    });

    it('should throw when startLine is greater than endLine', () => {
      expect(() => validateLineNumbers(5, 3, 10)).toThrow('Invalid line range: 5 > 3');
    });
  });

  describe('applyOperations', () => {
    let applyOperations: typeof import('../../../github/mcp/utils').applyOperations;

    const sampleContent = 'line 1\nline 2\nline 3\nline 4\nline 5';

    beforeEach(async () => {
      ({ applyOperations } = await import('../../../github/mcp/utils'));
    });

    it('should return original content when operations are empty', () => {
      expect(applyOperations(sampleContent, [])).toBe(sampleContent);
    });

    it('should return original content when operations is null-ish', () => {
      expect(applyOperations(sampleContent, undefined as any)).toBe(sampleContent);
    });

    describe('replace_lines', () => {
      it('should replace a single line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'replace_lines', lineStart: 2, lineEnd: 2, content: 'replaced line 2' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nreplaced line 2\nline 3\nline 4\nline 5');
      });

      it('should replace multiple lines', () => {
        const ops: LLMUpdateOperation[] = [
          {
            operation: 'replace_lines',
            lineStart: 2,
            lineEnd: 4,
            content: 'new line A\nnew line B',
          },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nnew line A\nnew line B\nline 5');
      });

      it('should replace all lines', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'replace_lines', lineStart: 1, lineEnd: 5, content: 'only line' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('only line');
      });
    });

    describe('insert_after', () => {
      it('should insert content after a line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_after', lineStart: 2, content: 'inserted line' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 2\ninserted line\nline 3\nline 4\nline 5');
      });

      it('should insert multiple lines after a line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_after', lineStart: 1, content: 'new A\nnew B' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nnew A\nnew B\nline 2\nline 3\nline 4\nline 5');
      });

      it('should insert after the last line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_after', lineStart: 5, content: 'appended' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 2\nline 3\nline 4\nline 5\nappended');
      });
    });

    describe('insert_before', () => {
      it('should insert content before a line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_before', lineStart: 3, content: 'inserted line' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 2\ninserted line\nline 3\nline 4\nline 5');
      });

      it('should insert before the first line', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_before', lineStart: 1, content: 'prepended' },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('prepended\nline 1\nline 2\nline 3\nline 4\nline 5');
      });
    });

    describe('delete_lines', () => {
      it('should delete a single line', () => {
        const ops: LLMUpdateOperation[] = [{ operation: 'delete_lines', lineStart: 3, lineEnd: 3 }];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 2\nline 4\nline 5');
      });

      it('should delete multiple lines', () => {
        const ops: LLMUpdateOperation[] = [{ operation: 'delete_lines', lineStart: 2, lineEnd: 4 }];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 5');
      });
    });

    describe('multiple operations', () => {
      it('should apply multiple operations in reverse order to avoid line shifts', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'replace_lines', lineStart: 2, lineEnd: 2, content: 'replaced 2' },
          { operation: 'delete_lines', lineStart: 4, lineEnd: 4 },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nreplaced 2\nline 3\nline 5');
      });

      it('should handle insert + delete together', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'insert_after', lineStart: 1, content: 'new after 1' },
          { operation: 'delete_lines', lineStart: 5, lineEnd: 5 },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nnew after 1\nline 2\nline 3\nline 4');
      });
    });

    describe('error handling', () => {
      it('should skip operations with missing required fields and continue', () => {
        const ops: LLMUpdateOperation[] = [
          { operation: 'replace_lines', lineStart: 2, lineEnd: 2 } as any,
          { operation: 'delete_lines', lineStart: 4, lineEnd: 4 },
        ];
        const result = applyOperations(sampleContent, ops);
        expect(result).toBe('line 1\nline 2\nline 3\nline 5');
      });
    });
  });

  describe('applyOperation', () => {
    let applyOperation: typeof import('../../../github/mcp/utils').applyOperation;

    beforeEach(async () => {
      ({ applyOperation } = await import('../../../github/mcp/utils'));
    });

    it('should apply a single operation', () => {
      const result = applyOperation('line 1\nline 2\nline 3', {
        operation: 'replace_lines',
        lineStart: 2,
        lineEnd: 2,
        content: 'replaced',
      });
      expect(result).toBe('line 1\nreplaced\nline 3');
    });
  });

  describe('visualizeUpdateOperations', () => {
    let visualizeUpdateOperations: typeof import('../../../github/mcp/utils').visualizeUpdateOperations;

    beforeEach(async () => {
      ({ visualizeUpdateOperations } = await import('../../../github/mcp/utils'));
    });

    it('should return a line-number-to-content mapping', () => {
      const content = 'line 1\nline 2\nline 3';
      const ops: LLMUpdateOperation[] = [
        { operation: 'replace_lines', lineStart: 2, lineEnd: 2, content: 'replaced' },
      ];
      const result = visualizeUpdateOperations(content, ops);
      expect(result).toEqual({
        1: 'line 1',
        2: 'replaced',
        3: 'line 3',
      });
    });

    it('should return mapping for empty operations (identity)', () => {
      const content = 'a\nb';
      const result = visualizeUpdateOperations(content, []);
      expect(result).toEqual({ 1: 'a', 2: 'b' });
    });
  });

  describe('generatePrMarkdown', () => {
    let generatePrMarkdown: typeof import('../../../github/mcp/utils').generatePrMarkdown;

    beforeEach(async () => {
      ({ generatePrMarkdown } = await import('../../../github/mcp/utils'));
    });

    const basePr: PullRequest = {
      number: 42,
      title: 'Fix bug',
      body: 'This fixes a critical bug.',
      author: { login: 'testuser' },
      url: 'https://github.com/owner/repo/pull/42',
      state: 'open',
      base: { ref: 'main', sha: 'abc123' },
      head: { ref: 'fix/bug', sha: 'def456' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-16T12:00:00Z',
    };

    it('should generate markdown with PR metadata', () => {
      const result = generatePrMarkdown(basePr, [], [], 'owner', 'repo');
      expect(result).toContain('# Pull Request #42: Fix bug');
      expect(result).toContain('Repository: owner/repo');
      expect(result).toContain('State: open');
      expect(result).toContain('Author: testuser');
      expect(result).toContain('Branch: fix/bug → main');
      expect(result).toContain('URL: https://github.com/owner/repo/pull/42');
    });

    it('should include description when body is present', () => {
      const result = generatePrMarkdown(basePr, [], [], 'owner', 'repo');
      expect(result).toContain('<description>\nThis fixes a critical bug.\n</description>');
    });

    it('should omit description when body is null', () => {
      const pr = { ...basePr, body: null };
      const result = generatePrMarkdown(pr, [], [], 'owner', 'repo');
      expect(result).not.toContain('<description>');
    });

    it('should include file diffs with commit messages', () => {
      const fileDiffs: ChangedFile[] = [
        {
          commit_messages: ['fix: resolve crash', 'fix: resolve crash'],
          path: 'src/app.ts',
          status: 'modified',
          additions: 10,
          deletions: 3,
        },
      ];
      const result = generatePrMarkdown(basePr, fileDiffs, [], 'owner', 'repo');
      expect(result).toContain('src/app.ts (+10/-3)');
      expect(result).toContain('  - fix: resolve crash');
      expect(result).not.toContain('  - fix: resolve crash\n  - fix: resolve crash');
    });

    it('should include review summary comments', () => {
      const comments: Comment[] = [
        {
          id: 1,
          body: 'Looks good!',
          author: { login: 'reviewer' },
          createdAt: '2026-01-16T10:00:00Z',
          type: 'review_summary',
          state: 'APPROVED',
        },
      ];
      const result = generatePrMarkdown(basePr, [], comments, 'owner', 'repo');
      expect(result).toContain('<comments>');
      expect(result).toContain('Review summaries:');
      expect(result).toContain('"body":"Looks good!"');
      expect(result).toContain('"state":"APPROVED"');
    });

    it('should include issue comments', () => {
      const comments: Comment[] = [
        {
          id: 2,
          body: 'Nice work!',
          author: { login: 'commenter' },
          createdAt: '2026-01-16T11:00:00Z',
          type: 'issue',
        },
      ];
      const result = generatePrMarkdown(basePr, [], comments, 'owner', 'repo');
      expect(result).toContain('comments:');
      expect(result).toContain('"login":"commenter"');
      expect(result).toContain('"body":"Nice work!"');
    });

    it('should include inline review comments', () => {
      const comments: Comment[] = [
        {
          id: 3,
          body: 'Consider renaming this.',
          author: { login: 'reviewer' },
          createdAt: '2026-01-16T12:00:00Z',
          type: 'review',
          path: 'src/utils.ts',
          line: 42,
        },
        {
          id: 4,
          body: 'Missing error handling.',
          author: { login: 'reviewer' },
          createdAt: '2026-01-16T12:05:00Z',
          type: 'review',
          path: 'src/utils.ts',
          line: 55,
        },
      ];
      const result = generatePrMarkdown(basePr, [], comments, 'owner', 'repo');
      expect(result).toContain('Inline review comments:');
      expect(result).toContain('"body":"Consider renaming this."');
      expect(result).toContain('"body":"Missing error handling."');
    });

    it('should sort comments by createdAt', () => {
      const comments: Comment[] = [
        {
          id: 2,
          body: 'Second',
          author: { login: 'user' },
          createdAt: '2026-01-16T12:00:00Z',
          type: 'issue',
        },
        {
          id: 1,
          body: 'First',
          author: { login: 'user' },
          createdAt: '2026-01-16T10:00:00Z',
          type: 'issue',
        },
      ];
      const result = generatePrMarkdown(basePr, [], comments, 'owner', 'repo');
      const firstIdx = result.indexOf('"body":"First"');
      const secondIdx = result.indexOf('"body":"Second"');
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('should not include comments section when there are no comments', () => {
      const result = generatePrMarkdown(basePr, [], [], 'owner', 'repo');
      expect(result).not.toContain('<comments>');
    });
  });

  describe('formatFileDiff', () => {
    let formatFileDiff: typeof import('../../../github/mcp/utils').formatFileDiff;

    beforeEach(async () => {
      ({ formatFileDiff } = await import('../../../github/mcp/utils'));
    });

    it('should format file diffs with patches', async () => {
      const files: ChangedFile[] = [
        {
          commit_messages: [],
          path: 'src/index.ts',
          status: 'modified',
          additions: 5,
          deletions: 2,
          patch: '@@ -1,3 +1,4 @@\n+import { foo } from "bar";',
        },
      ];
      const result = await formatFileDiff(10, files);
      expect(result).toContain('## File Patches for PR #10');
      expect(result).toContain('Found 1 file(s)');
      expect(result).toContain('### src/index.ts');
      expect(result).toContain('**Status:** modified | **+5** / **-2**');
      expect(result).toContain('```diff');
      expect(result).toContain('+import { foo } from "bar";');
    });

    it('should show placeholder when no patch is available', async () => {
      const files: ChangedFile[] = [
        {
          commit_messages: [],
          path: 'image.png',
          status: 'added',
          additions: 0,
          deletions: 0,
        },
      ];
      const result = await formatFileDiff(5, files);
      expect(result).toContain('_No patch available (file may be binary or too large)_');
    });

    it('should include file contents when requested', async () => {
      const files: ChangedFile[] = [
        {
          commit_messages: [],
          path: 'readme.md',
          status: 'modified',
          additions: 1,
          deletions: 0,
          contents: '# Hello World',
        },
      ];
      const result = await formatFileDiff(1, files, true);
      expect(result).toContain('<details>');
      expect(result).toContain('Full file contents');
      expect(result).toContain('# Hello World');
    });

    it('should not include file contents when not requested', async () => {
      const files: ChangedFile[] = [
        {
          commit_messages: [],
          path: 'readme.md',
          status: 'modified',
          additions: 1,
          deletions: 0,
          contents: '# Hello World',
        },
      ];
      const result = await formatFileDiff(1, files, false);
      expect(result).not.toContain('<details>');
      expect(result).not.toContain('# Hello World');
    });

    it('should handle empty file list', async () => {
      const result = await formatFileDiff(99, []);
      expect(result).toContain('Found 0 file(s)');
    });
  });

  describe('fetchPrInfo', () => {
    let fetchPrInfo: typeof import('../../../github/mcp/utils').fetchPrInfo;

    beforeEach(async () => {
      ({ fetchPrInfo } = await import('../../../github/mcp/utils'));
    });

    it('should fetch and map pull request data', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            get: vi.fn().mockResolvedValue({
              data: {
                number: 42,
                title: 'Test PR',
                body: 'PR body',
                user: { login: 'author' },
                html_url: 'https://github.com/owner/repo/pull/42',
                state: 'open',
                base: { ref: 'main', sha: 'base-sha' },
                head: { ref: 'feature', sha: 'head-sha' },
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-02T00:00:00Z',
              },
            }),
          },
        },
      } as any;

      const result = await fetchPrInfo(mockOctokit, 'owner', 'repo', 42);

      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 42,
      });
      expect(result).toEqual({
        number: 42,
        title: 'Test PR',
        body: 'PR body',
        author: { login: 'author' },
        url: 'https://github.com/owner/repo/pull/42',
        state: 'open',
        base: { ref: 'main', sha: 'base-sha' },
        head: { ref: 'feature', sha: 'head-sha' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      });
    });
  });

  describe('fetchPrCommits', () => {
    let fetchPrCommits: typeof import('../../../github/mcp/utils').fetchPrCommits;

    beforeEach(async () => {
      ({ fetchPrCommits } = await import('../../../github/mcp/utils'));
    });

    it('should fetch all commits with pagination', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            listCommits: vi
              .fn()
              .mockResolvedValueOnce({
                data: [
                  { sha: 'aaa', commit: { message: 'first' } },
                  { sha: 'bbb', commit: { message: 'second' } },
                ],
              })
              .mockResolvedValueOnce({
                data: [],
              }),
          },
        },
      } as any;

      const result = await fetchPrCommits(mockOctokit, 'owner', 'repo', 1);
      expect(result).toHaveLength(2);
      expect(result[0].sha).toBe('aaa');
      expect(result[1].sha).toBe('bbb');
    });

    it('should throw on API error', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            listCommits: vi.fn().mockRejectedValue(new Error('API rate limit')),
          },
        },
      } as any;

      await expect(fetchPrCommits(mockOctokit, 'owner', 'repo', 1)).rejects.toThrow(
        'Failed to get PR commits: API rate limit'
      );
    });
  });

  describe('fetchCommitDetails', () => {
    let fetchCommitDetails: typeof import('../../../github/mcp/utils').fetchCommitDetails;

    beforeEach(async () => {
      ({ fetchCommitDetails } = await import('../../../github/mcp/utils'));
    });

    it('should fetch commit details', async () => {
      const commitData = {
        sha: 'abc123',
        files: [{ filename: 'file.ts', additions: 5, deletions: 2 }],
      };
      const mockOctokit = {
        rest: {
          repos: {
            getCommit: vi.fn().mockResolvedValue({ data: commitData }),
          },
        },
      } as any;

      const result = await fetchCommitDetails(mockOctokit, 'owner', 'repo', 'abc123');
      expect(result).toEqual(commitData);
      expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'abc123',
      });
    });

    it('should throw on API error', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            getCommit: vi.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      } as any;

      await expect(fetchCommitDetails(mockOctokit, 'owner', 'repo', 'bad-sha')).rejects.toThrow(
        'Failed to get commit details: Not found'
      );
    });
  });

  describe('fetchComments', () => {
    let fetchComments: typeof import('../../../github/mcp/utils').fetchComments;

    beforeEach(async () => {
      ({ fetchComments } = await import('../../../github/mcp/utils'));
    });

    function createPaginateIterator(items: any[]) {
      return async function* () {
        yield { data: items };
      };
    }

    it('should merge issue, review, and review summary comments', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi
            .fn()
            .mockImplementationOnce(() =>
              createPaginateIterator([
                {
                  id: 1,
                  body: 'General comment',
                  user: { login: 'user1' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T01:00:00Z',
                },
              ])()
            )
            .mockImplementationOnce(() =>
              createPaginateIterator([
                {
                  id: 2,
                  body: 'Code comment',
                  user: { login: 'user2' },
                  created_at: '2026-01-01T02:00:00Z',
                  updated_at: '2026-01-01T03:00:00Z',
                  path: 'src/file.ts',
                  line: 10,
                  original_line: 10,
                  diff_hunk: '@@ -1,3 +1,3 @@',
                },
              ])()
            )
            .mockImplementationOnce(() =>
              createPaginateIterator([
                {
                  id: 3,
                  body: 'LGTM',
                  user: { login: 'reviewer' },
                  submitted_at: '2026-01-01T04:00:00Z',
                  state: 'APPROVED',
                },
              ])()
            ),
        },
        rest: {
          issues: { listComments: vi.fn() },
          pulls: { listReviewComments: vi.fn(), listReviews: vi.fn() },
        },
      } as any;

      const result = await fetchComments(mockOctokit, 'owner', 'repo', 1);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('issue');
      expect(result[0].body).toBe('General comment');
      expect(result[1].type).toBe('review');
      expect(result[1].path).toBe('src/file.ts');
      expect(result[2].type).toBe('review_summary');
      expect(result[2].state).toBe('APPROVED');
    });

    it('should filter out non-inkeep bot comments', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi
            .fn()
            .mockImplementationOnce(() =>
              createPaginateIterator([
                {
                  id: 1,
                  body: 'Bot comment',
                  user: { login: 'dependabot[bot]' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                },
                {
                  id: 2,
                  body: 'Inkeep comment',
                  user: { login: 'inkeep[bot]' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                },
                {
                  id: 3,
                  body: 'Human comment',
                  user: { login: 'human-user' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                },
              ])()
            )
            .mockImplementationOnce(() => createPaginateIterator([])())
            .mockImplementationOnce(() => createPaginateIterator([])()),
        },
        rest: {
          issues: { listComments: vi.fn() },
          pulls: { listReviewComments: vi.fn(), listReviews: vi.fn() },
        },
      } as any;

      const result = await fetchComments(mockOctokit, 'owner', 'repo', 1);

      expect(result).toHaveLength(2);
      expect(result.find((c) => c.author.login === 'dependabot[bot]')).toBeUndefined();
      expect(result.find((c) => c.author.login === 'inkeep[bot]')).toBeDefined();
      expect(result.find((c) => c.author.login === 'human-user')).toBeDefined();
    });

    it('should detect suggestion comments', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi
            .fn()
            .mockImplementationOnce(() => createPaginateIterator([])())
            .mockImplementationOnce(() =>
              createPaginateIterator([
                {
                  id: 1,
                  body: 'Try this:\n```suggestion\nconst x = 1;\n```',
                  user: { login: 'reviewer' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                  path: 'file.ts',
                  line: 5,
                  original_line: 5,
                  diff_hunk: '',
                },
                {
                  id: 2,
                  body: 'Regular review comment',
                  user: { login: 'reviewer' },
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                  path: 'file.ts',
                  line: 10,
                  original_line: 10,
                  diff_hunk: '',
                },
              ])()
            )
            .mockImplementationOnce(() => createPaginateIterator([])()),
        },
        rest: {
          issues: { listComments: vi.fn() },
          pulls: { listReviewComments: vi.fn(), listReviews: vi.fn() },
        },
      } as any;

      const result = await fetchComments(mockOctokit, 'owner', 'repo', 1);

      expect(result).toHaveLength(2);
      expect(result[0].isSuggestion).toBe(true);
      expect(result[1].isSuggestion).toBe(false);
    });
  });

  describe('createIssueCommentReaction', () => {
    let createIssueCommentReaction: typeof import('../../../github/mcp/utils').createIssueCommentReaction;

    beforeEach(async () => {
      ({ createIssueCommentReaction } = await import('../../../github/mcp/utils'));
    });

    it('should create a reaction and return id and content', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            createForIssueComment: vi.fn().mockResolvedValue({
              data: { id: 101, content: '+1' },
            }),
          },
        },
      } as any;

      const result = await createIssueCommentReaction(mockOctokit, 'owner', 'repo', 42, '+1');

      expect(mockOctokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 42,
        content: '+1',
      });
      expect(result).toEqual({ id: 101, content: '+1' });
    });

    it('should propagate API errors', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            createForIssueComment: vi.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      } as any;

      await expect(
        createIssueCommentReaction(mockOctokit, 'owner', 'repo', 999, 'heart')
      ).rejects.toThrow('Not found');
    });
  });

  describe('deleteIssueCommentReaction', () => {
    let deleteIssueCommentReaction: typeof import('../../../github/mcp/utils').deleteIssueCommentReaction;

    beforeEach(async () => {
      ({ deleteIssueCommentReaction } = await import('../../../github/mcp/utils'));
    });

    it('should call the delete API with correct parameters', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            deleteForIssueComment: vi.fn().mockResolvedValue({}),
          },
        },
      } as any;

      await deleteIssueCommentReaction(mockOctokit, 'owner', 'repo', 42, 101);

      expect(mockOctokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 42,
        reaction_id: 101,
      });
    });

    it('should propagate API errors', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            deleteForIssueComment: vi.fn().mockRejectedValue(new Error('Forbidden')),
          },
        },
      } as any;

      await expect(
        deleteIssueCommentReaction(mockOctokit, 'owner', 'repo', 42, 101)
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('createPullRequestReviewCommentReaction', () => {
    let createPullRequestReviewCommentReaction: typeof import('../../../github/mcp/utils').createPullRequestReviewCommentReaction;

    beforeEach(async () => {
      ({ createPullRequestReviewCommentReaction } = await import('../../../github/mcp/utils'));
    });

    it('should create a reaction and return id and content', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            createForPullRequestReviewComment: vi.fn().mockResolvedValue({
              data: { id: 202, content: 'rocket' },
            }),
          },
        },
      } as any;

      const result = await createPullRequestReviewCommentReaction(
        mockOctokit,
        'owner',
        'repo',
        55,
        'rocket'
      );

      expect(mockOctokit.rest.reactions.createForPullRequestReviewComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 55,
        content: 'rocket',
      });
      expect(result).toEqual({ id: 202, content: 'rocket' });
    });

    it('should propagate API errors', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            createForPullRequestReviewComment: vi.fn().mockRejectedValue(new Error('422')),
          },
        },
      } as any;

      await expect(
        createPullRequestReviewCommentReaction(mockOctokit, 'owner', 'repo', 55, 'eyes')
      ).rejects.toThrow('422');
    });
  });

  describe('deletePullRequestReviewCommentReaction', () => {
    let deletePullRequestReviewCommentReaction: typeof import('../../../github/mcp/utils').deletePullRequestReviewCommentReaction;

    beforeEach(async () => {
      ({ deletePullRequestReviewCommentReaction } = await import('../../../github/mcp/utils'));
    });

    it('should call the delete API with correct parameters', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            deleteForPullRequestComment: vi.fn().mockResolvedValue({}),
          },
        },
      } as any;

      await deletePullRequestReviewCommentReaction(mockOctokit, 'owner', 'repo', 55, 202);

      expect(mockOctokit.rest.reactions.deleteForPullRequestComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 55,
        reaction_id: 202,
      });
    });

    it('should propagate API errors', async () => {
      const mockOctokit = {
        rest: {
          reactions: {
            deleteForPullRequestComment: vi.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      } as any;

      await expect(
        deletePullRequestReviewCommentReaction(mockOctokit, 'owner', 'repo', 55, 202)
      ).rejects.toThrow('Not found');
    });
  });

  describe('listIssueCommentReactions', () => {
    let listIssueCommentReactions: typeof import('../../../github/mcp/utils').listIssueCommentReactions;

    beforeEach(async () => {
      ({ listIssueCommentReactions } = await import('../../../github/mcp/utils'));
    });

    function createPaginateIterator(items: any[]) {
      return async function* () {
        yield { data: items };
      };
    }

    it('should return reaction details with IDs', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi.fn().mockImplementation(() =>
            createPaginateIterator([
              {
                id: 101,
                content: '+1',
                user: { login: 'alice' },
                created_at: '2026-01-01T00:00:00Z',
              },
              {
                id: 102,
                content: 'heart',
                user: { login: 'bob' },
                created_at: '2026-01-01T01:00:00Z',
              },
            ])()
          ),
        },
        rest: { reactions: { listForIssueComment: vi.fn() } },
      } as any;

      const result = await listIssueCommentReactions(mockOctokit, 'owner', 'repo', 42);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 101,
        content: '+1',
        user: 'alice',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result[1]).toEqual({
        id: 102,
        content: 'heart',
        user: 'bob',
        createdAt: '2026-01-01T01:00:00Z',
      });
    });

    it('should return empty array when no reactions', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi.fn().mockImplementation(() => createPaginateIterator([])()),
        },
        rest: { reactions: { listForIssueComment: vi.fn() } },
      } as any;

      const result = await listIssueCommentReactions(mockOctokit, 'owner', 'repo', 42);
      expect(result).toEqual([]);
    });
  });

  describe('listPullRequestReviewCommentReactions', () => {
    let listPullRequestReviewCommentReactions: typeof import('../../../github/mcp/utils').listPullRequestReviewCommentReactions;

    beforeEach(async () => {
      ({ listPullRequestReviewCommentReactions } = await import('../../../github/mcp/utils'));
    });

    function createPaginateIterator(items: any[]) {
      return async function* () {
        yield { data: items };
      };
    }

    it('should return reaction details with IDs', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi.fn().mockImplementation(() =>
            createPaginateIterator([
              {
                id: 201,
                content: 'rocket',
                user: { login: 'charlie' },
                created_at: '2026-02-01T00:00:00Z',
              },
            ])()
          ),
        },
        rest: { reactions: { listForPullRequestReviewComment: vi.fn() } },
      } as any;

      const result = await listPullRequestReviewCommentReactions(mockOctokit, 'owner', 'repo', 55);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 201,
        content: 'rocket',
        user: 'charlie',
        createdAt: '2026-02-01T00:00:00Z',
      });
    });

    it('should handle missing user gracefully', async () => {
      const mockOctokit = {
        paginate: {
          iterator: vi
            .fn()
            .mockImplementation(() =>
              createPaginateIterator([
                { id: 301, content: 'eyes', user: null, created_at: '2026-02-01T00:00:00Z' },
              ])()
            ),
        },
        rest: { reactions: { listForPullRequestReviewComment: vi.fn() } },
      } as any;

      const result = await listPullRequestReviewCommentReactions(mockOctokit, 'owner', 'repo', 55);

      expect(result[0].user).toBe('unknown');
    });
  });

  describe('getGitHubClientFromRepo', () => {
    let getGitHubClientFromRepo: typeof import('../../../github/mcp/utils').getGitHubClientFromRepo;

    beforeEach(async () => {
      ({ getGitHubClientFromRepo } = await import('../../../github/mcp/utils'));
    });

    it('should throw when installation ID is not found', () => {
      const map = new Map<string, string>();
      expect(() => getGitHubClientFromRepo('owner', 'repo', map)).toThrow(
        'Installation ID not found for repository owner/repo'
      );
    });
  });
});
