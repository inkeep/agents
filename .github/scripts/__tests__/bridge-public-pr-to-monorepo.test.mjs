import { describe, expect, it } from 'vitest';
import { prefixPatchPaths } from '../bridge-public-pr-to-monorepo.mjs';

const MIRROR_PREFIX = 'public/agents';

describe('prefixPatchPaths', () => {
  it('prefixes unquoted diff headers', () => {
    const patch = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('diff --git a/public/agents/README.md b/public/agents/README.md');
    expect(result).toContain('--- a/public/agents/README.md');
    expect(result).toContain('+++ b/public/agents/README.md');
  });

  it('prefixes quoted diff headers', () => {
    const patch = [
      'diff --git "a/file\\twith tab.md" "b/file\\twith tab.md"',
      '--- "a/file\\twith tab.md"',
      '+++ "b/file\\twith tab.md"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain(
      'diff --git "a/public/agents/file\\twith tab.md" "b/public/agents/file\\twith tab.md"'
    );
    expect(result).toContain('--- "a/public/agents/file\\twith tab.md"');
    expect(result).toContain('+++ "b/public/agents/file\\twith tab.md"');
  });

  it('handles mixed quoted/unquoted diff headers', () => {
    const patch = [
      'diff --git a/normal.txt "b/file with spaces.txt"',
      '--- a/normal.txt',
      '+++ "b/file with spaces.txt"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain(
      'diff --git a/public/agents/normal.txt "b/public/agents/file with spaces.txt"'
    );
    expect(result).toContain('--- a/public/agents/normal.txt');
    expect(result).toContain('+++ "b/public/agents/file with spaces.txt"');
  });

  it('preserves /dev/null for new files', () => {
    const patch = [
      'diff --git a/new-file.txt b/new-file.txt',
      '--- /dev/null',
      '+++ b/new-file.txt',
      '@@ -0,0 +1 @@',
      '+content',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('--- /dev/null');
    expect(result).toContain('+++ b/public/agents/new-file.txt');
  });

  it('preserves /dev/null for deleted files', () => {
    const patch = [
      'diff --git a/old-file.txt b/old-file.txt',
      '--- a/old-file.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-content',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('--- a/public/agents/old-file.txt');
    expect(result).toContain('+++ /dev/null');
  });

  it('rejects path traversal with ..', () => {
    const patch = [
      'diff --git a/../etc/passwd b/../etc/passwd',
      '--- a/../etc/passwd',
      '+++ b/../etc/passwd',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('path traversal');
  });

  it('rejects path traversal with . segment', () => {
    const patch = [
      'diff --git a/./etc/passwd b/./etc/passwd',
      '--- a/./etc/passwd',
      '+++ b/./etc/passwd',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('path traversal');
  });

  it('rejects C-style octal escape path traversal (\\056\\056 = ..)', () => {
    const patch = [
      'diff --git "a/\\056\\056/etc/passwd" "b/\\056\\056/etc/passwd"',
      '--- "a/\\056\\056/etc/passwd"',
      '+++ "b/\\056\\056/etc/passwd"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('path traversal');
  });

  it('rejects C-style hex escape path traversal (\\x2e\\x2e = ..)', () => {
    const patch = [
      'diff --git "a/\\x2e\\x2e/etc/passwd" "b/\\x2e\\x2e/etc/passwd"',
      '--- "a/\\x2e\\x2e/etc/passwd"',
      '+++ "b/\\x2e\\x2e/etc/passwd"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('path traversal');
  });

  it('prefixes rename from/to headers', () => {
    const patch = [
      'diff --git a/old-name.txt b/new-name.txt',
      'similarity index 100%',
      'rename from old-name.txt',
      'rename to new-name.txt',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('rename from public/agents/old-name.txt');
    expect(result).toContain('rename to public/agents/new-name.txt');
  });

  it('prefixes quoted rename from/to headers', () => {
    const patch = [
      'diff --git "a/old name.txt" "b/new name.txt"',
      'similarity index 100%',
      'rename from "old name.txt"',
      'rename to "new name.txt"',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('rename from "public/agents/old name.txt"');
    expect(result).toContain('rename to "public/agents/new name.txt"');
  });

  it('prefixes copy from/to headers', () => {
    const patch = [
      'diff --git a/src.txt b/dst.txt',
      'similarity index 100%',
      'copy from src.txt',
      'copy to dst.txt',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('copy from public/agents/src.txt');
    expect(result).toContain('copy to public/agents/dst.txt');
  });

  it('prefixes quoted copy from/to headers', () => {
    const patch = [
      'diff --git "a/src file.txt" "b/dst file.txt"',
      'similarity index 100%',
      'copy from "src file.txt"',
      'copy to "dst file.txt"',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('copy from "public/agents/src file.txt"');
    expect(result).toContain('copy to "public/agents/dst file.txt"');
  });

  it('throws on unrecognized --- header format', () => {
    const patch = [
      'diff --git a/file.txt b/file.txt',
      '--- file.txt',
      '+++ b/file.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('unrecognized --- header format');
  });

  it('throws on unrecognized +++ header format', () => {
    const patch = [
      'diff --git a/file.txt b/file.txt',
      '--- a/file.txt',
      '+++ file.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(() => prefixPatchPaths(patch, MIRROR_PREFIX)).toThrow('unrecognized +++ header format');
  });

  it('passes through non-header lines unchanged', () => {
    const patch = [
      'diff --git a/file.txt b/file.txt',
      'index abc123..def456 100644',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,3 +1,3 @@',
      ' context line',
      '-removed line',
      '+added line',
    ].join('\n');

    const result = prefixPatchPaths(patch, MIRROR_PREFIX);
    expect(result).toContain('index abc123..def456 100644');
    expect(result).toContain('@@ -1,3 +1,3 @@');
    expect(result).toContain(' context line');
    expect(result).toContain('-removed line');
    expect(result).toContain('+added line');
  });

  it('normalizes double slashes in prefix', () => {
    const patch = [
      'diff --git a/file.txt b/file.txt',
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const result = prefixPatchPaths(patch, '/public/agents/');
    expect(result).toContain('a/public/agents/file.txt');
    expect(result).not.toContain('//');
  });
});
