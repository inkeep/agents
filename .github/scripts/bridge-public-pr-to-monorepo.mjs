import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep the public PR bridge copies code-shape aligned. They ship to
// separate public repos through Copybara, so they cannot import shared code.
// Sibling bridge copies:
// - public/agents-optional-local-dev/.github/scripts/bridge-public-pr-to-monorepo.mjs
// - public/open-knowledge/.github/scripts/bridge-public-pr-to-monorepo.mjs
const BRIDGE_COMMENT_MARKER = '<!-- monorepo-pr-bridge -->';

// Strip x-access-token credentials from any string that might end up in an
// error message, log line, or thrown exception. GitHub Actions masks repo
// secrets in its own job log, but this script's exceptions can also surface
// in PR comments (`buildPublicComment` failed-state path), failure-alert
// issues, or future error-reporting integrations — none of which inherit the
// Actions log mask. Defense-in-depth: redact at the boundary so token leakage
// is impossible regardless of where the message ends up.
function sanitizeErrorMessage(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/https:\/\/x-access-token:[^@\s]+@/g, 'https://x-access-token:***@');
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const stderr = sanitizeErrorMessage(error.stderr?.toString().trim() ?? '');
    const stdout = sanitizeErrorMessage(error.stdout?.toString().trim() ?? '');
    const details = [stderr, stdout].filter(Boolean).join('\n');
    const fallback = sanitizeErrorMessage(`${command} ${args.join(' ')} failed`);
    throw new Error(details || fallback);
  }
}

async function githubRequest({
  token,
  method = 'GET',
  path: requestPath,
  body,
  accept = 'application/vnd.github+json',
}) {
  const response = await fetch(`https://api.github.com${requestPath}`, {
    method,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'User-Agent': 'inkeep-public-pr-bridge',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${requestPath} failed (${response.status}): ${text}`);
  }

  // .patch and .diff return raw text, not JSON. All other accept types
  // (incl. the default application/vnd.github+json) return JSON.
  const isTextResponse =
    accept === 'application/vnd.github.patch' || accept === 'application/vnd.github.diff';
  return isTextResponse ? text : text ? JSON.parse(text) : null;
}

async function githubGraphql({ token, query, variables }) {
  const result = await githubRequest({
    token,
    method: 'POST',
    path: '/graphql',
    body: { query, variables },
  });
  if (result?.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
  }
  return result;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getPublicPrBranchName(prefix, prNumber) {
  return `${prefix}-${prNumber}`;
}

function parseJsonEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function fallbackPublicAuthor(publicPr) {
  return (
    normalizeGitHubUserAuthor(publicPr.user) ?? {
      name: publicPr.user.login,
      email: `${publicPr.user.id}+${publicPr.user.login}@users.noreply.github.com`,
    }
  );
}

function normalizeGitHubUserAuthor(user) {
  const login = user?.login?.trim();
  const id = user?.id;
  if (!login || id === undefined || id === null) return null;
  if (/\[bot\]$/i.test(login)) return null;
  return {
    name: login,
    email: `${id}+${login}@users.noreply.github.com`,
  };
}

function normalizeCommitAuthor(author) {
  const name = author?.name?.trim();
  const email = author?.email?.trim();
  if (!name || !email || !email.includes('@')) return null;
  if (/[\r\n<>]/.test(name) || /[\r\n<>]/.test(email)) return null;
  if (/\[bot\]$/i.test(name) || /\[bot\]@users\.noreply\.github\.com$/i.test(email)) {
    return null;
  }
  return { name, email };
}

function uniqueCommitAuthors(authors, fallbackAuthor) {
  const unique = new Map();
  for (const author of authors) {
    const normalized = normalizeCommitAuthor(author);
    if (!normalized) continue;
    unique.set(`${normalized.name.toLowerCase()} <${normalized.email.toLowerCase()}>`, normalized);
  }
  return unique.size > 0 ? [...unique.values()] : [fallbackAuthor];
}

async function listPublicPrCommitAuthors({ token, repo, prNumber, request = githubRequest }) {
  const commitAuthors = [];
  let page = 1;
  while (true) {
    const commits = await request({
      token,
      path: `/repos/${repo}/pulls/${prNumber}/commits?per_page=100&page=${page}`,
    });
    commitAuthors.push(
      ...commits.map((commit) => normalizeGitHubUserAuthor(commit.author) ?? commit.commit?.author)
    );
    if (commits.length < 100) break;
    page++;
  }
  return commitAuthors;
}

function buildCommitAttribution({ commitAuthors, fallbackAuthor }) {
  const authors = uniqueCommitAuthors(commitAuthors, fallbackAuthor);
  const trailers = authors.map((author) => `Co-authored-by: ${author.name} <${author.email}>`);
  return { trailers };
}

// True when a `githubRequest` failed because the PR diff exceeds GitHub's
// hard cap on the diff endpoint (currently 20,000 lines). The API surfaces
// this as a 406 with body `diff exceeded the maximum number of lines (20000)`,
// or a JSON error with `diff_too_large` in the message. Detect by message
// text since we don't preserve the HTTP status separately. The patterns are
// kept narrow on purpose: a bare `too_large` would also match unrelated 422s
// (e.g. PR body validation `{"code":"too_long"}` is adjacent — `too_large`
// itself is rare for non-diff endpoints, but we don't rely on coincidence).
function isDiffTooLargeError(error) {
  if (!error || typeof error.message !== 'string') return false;
  return /diff exceeded the maximum number of lines|diff is too large|diff_too_large/i.test(
    error.message
  );
}

// Compute the PR's diff locally from the public PR refs that syncPublicPr has
// already fetched into agents-private's object store. 3-dot diff mirrors
// GitHub's `.diff` semantics (compares against merge-base). Used as the
// fallback when the API rejects the PR as too large; also implicitly helps
// `git apply --3way` later because the same fetch made the patch's base blobs
// reachable in agents-private's clone.
//
// maxBuffer is bumped to 50 MB because this fallback fires specifically for
// oversized PRs (>20,000 lines on the API endpoint). Node's default 1 MB
// would truncate the very diffs this path is meant to handle.
function fetchPullRequestDiffViaLocalGit({ internalRepoDir, sourceBaseRef, sourceHeadRef }) {
  return run('git', ['-C', internalRepoDir, 'diff', `${sourceBaseRef}...${sourceHeadRef}`], {
    maxBuffer: 50 * 1024 * 1024,
  });
}

async function fetchPullRequestDiff({
  publicToken,
  publicRepo,
  publicPr,
  internalRepoDir,
  sourceBaseRef,
  sourceHeadRef,
  refsFetched,
}) {
  try {
    return await githubRequest({
      token: publicToken,
      path: `/repos/${publicRepo}/pulls/${publicPr.number}`,
      accept: 'application/vnd.github.diff',
    });
  } catch (error) {
    if (!isDiffTooLargeError(error)) throw error;
    if (!refsFetched) {
      throw new Error(
        `Bridge: cannot use local-git-diff fallback for PR #${publicPr.number} — ` +
          `the public PR refs failed to fetch into agents-private earlier in this run. ` +
          `See the preceding "Bridge: fetch at --depth=..." warning for the original ` +
          `fetch failure; resolve that and re-run.`
      );
    }
    console.log(
      `Bridge: GitHub diff API rejected PR #${publicPr.number} as too large; ` +
        'falling back to local git diff against fetched public PR refs.'
    );
    return fetchPullRequestDiffViaLocalGit({ internalRepoDir, sourceBaseRef, sourceHeadRef });
  }
}

// Drop diff sections whose old or new path matches any excluded prefix.
// Excluded paths are relative to the PUBLIC repo root (pre-prefix). Used to
// stop pre-cutover branches from re-introducing internal-only paths
// (`specs/`, `reports/`, `.codex/`, etc.) that the public mirror no longer
// exports — those paths exist on agents-private's side but should not flow
// back through the bridge.
function filterDiffByPath(patch, excludedPrefixes) {
  if (!excludedPrefixes || excludedPrefixes.length === 0) return patch;

  const sections = patch.split(/(?=^diff --git )/m);
  const kept = [];
  const dropped = [];

  for (const section of sections) {
    if (!section.startsWith('diff --git ')) {
      kept.push(section);
      continue;
    }
    const match = section.match(/^diff --git a\/(.+?) b\/(.+?)\n/);
    if (!match) {
      kept.push(section);
      continue;
    }
    const aPath = match[1].replace(/^"(.+)"$/, '$1');
    const bPath = match[2].replace(/^"(.+)"$/, '$1');

    const isExcluded = excludedPrefixes.some(
      (prefix) => aPath.startsWith(prefix) || bPath.startsWith(prefix)
    );

    if (isExcluded) {
      dropped.push(aPath === bPath ? aPath : `${aPath} -> ${bPath}`);
    } else {
      kept.push(section);
    }
  }

  if (dropped.length > 0) {
    const preview = dropped.slice(0, 20).join('\n  ');
    const more = dropped.length > 20 ? `\n  ...and ${dropped.length - 20} more` : '';
    console.log(
      `Bridge: filtered ${dropped.length} diff section(s) matching excluded prefixes:\n  ${preview}${more}`
    );
  }

  return kept.join('');
}

function prefixPatchPaths(patch, prefix, pathRewrites = {}) {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const prefixedPath = (value) => {
    if (value === '/dev/null') {
      return value;
    }

    const unquoted = value.replace(/^"(.+)"$/, '$1');

    // Reject path traversal attempts
    const segments = unquoted.split('/');
    if (segments.some((s) => s === '..' || s === '.')) {
      throw new Error(`Rejecting patch with path traversal: ${unquoted}`);
    }

    const rewrite = pathRewrites[unquoted];
    if (rewrite) {
      const rewriteSegments = rewrite.split('/');
      if (rewriteSegments.some((s) => s === '..' || s === '.')) {
        throw new Error(`Rejecting patch rewrite with path traversal: ${rewrite}`);
      }
    }

    const nextValue = rewrite ?? `${normalizedPrefix}/${unquoted}`.replace(/\/+/g, '/');
    return value.startsWith('"') ? `"${nextValue}"` : nextValue;
  };

  return patch
    .split('\n')
    .map((line) => {
      if (line.startsWith('diff --git a/')) {
        const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (!match) {
          return line;
        }
        return `diff --git a/${prefixedPath(match[1])} b/${prefixedPath(match[2])}`;
      }
      if (line.startsWith('--- a/')) {
        return `--- a/${prefixedPath(line.slice(6))}`;
      }
      if (line.startsWith('+++ b/')) {
        return `+++ b/${prefixedPath(line.slice(6))}`;
      }
      if (line.startsWith('rename from ')) {
        return `rename from ${prefixedPath(line.slice('rename from '.length))}`;
      }
      if (line.startsWith('rename to ')) {
        return `rename to ${prefixedPath(line.slice('rename to '.length))}`;
      }
      if (line.startsWith('copy from ')) {
        return `copy from ${prefixedPath(line.slice('copy from '.length))}`;
      }
      if (line.startsWith('copy to ')) {
        return `copy to ${prefixedPath(line.slice('copy to '.length))}`;
      }
      return line;
    })
    .join('\n');
}

function internalPullRequestTitle(publicPr) {
  return `Sync public PR #${publicPr.number}: ${publicPr.title}`;
}

function buildBridgeMetadata(publicPr, mirrorPath) {
  return [
    '<!-- public-pr-sync',
    `public_repo=${publicPr.base.repo.full_name}`,
    `public_pr_number=${publicPr.number}`,
    `public_pr_url=${publicPr.html_url}`,
    `public_author_login=${publicPr.user.login}`,
    `public_author_id=${publicPr.user.id}`,
    `mirror_path=${mirrorPath}`,
    '-->',
  ].join('\n');
}

// GitHub PR body hard limit. Exceeding returns 422 "body is too long".
const GITHUB_PR_BODY_LIMIT = 65536;

function buildInternalPrBody({ publicPr, branchName, mirrorPath }) {
  const rawOriginal = publicPr.body?.trim()
    ? publicPr.body.trim()
    : '_No public PR body was provided._';

  const compose = (original) => `## Summary
Mirror public PR [#${publicPr.number}](${publicPr.html_url}) from \`${publicPr.base.repo.full_name}\` into \`inkeep/agents-private\` for canonical review and merge.

## Attribution
- Original author: @${publicPr.user.login}
- Public branch: \`${publicPr.head.label}\`
- Monorepo branch: \`${branchName}\`
- Monorepo path: \`${mirrorPath}\`

## Original PR Body
<details>
<summary>Expand</summary>

${original}

</details>

## Notes
- This PR branch is auto-managed from the public repo PR.
- Merge the monorepo PR, not the public PR.
- After the internal PR merges, the public repo should be updated by the next non-dry-run mirror sync.

${buildBridgeMetadata(publicPr, mirrorPath)}`;

  let body = compose(rawOriginal);
  if (body.length > GITHUB_PR_BODY_LIMIT) {
    const footer = `\n\n_...truncated. Original body exceeded GitHub's ${GITHUB_PR_BODY_LIMIT}-char PR body limit; see [original PR](${publicPr.html_url}) for full content._`;
    const scaffolding = body.length - rawOriginal.length;
    const budget = GITHUB_PR_BODY_LIMIT - scaffolding - footer.length - 100;
    const truncated = rawOriginal.slice(0, Math.max(budget, 0)) + footer;
    console.log(
      `Bridge: PR body exceeded GitHub's ${GITHUB_PR_BODY_LIMIT}-char limit ` +
        `(original: ${rawOriginal.length} chars, truncated to: ${truncated.length} chars).`
    );
    body = compose(truncated);
  }
  return body;
}

function buildPublicComment({ publicPr, status, details }) {
  if (status === 'synced') {
    return `${BRIDGE_COMMENT_MARKER}
Thanks for the contribution! A maintainer will review and merge your PR. Your commit attribution is preserved as @${publicPr.user.login}.

**What happens next:**

- A maintainer will review your PR.
- If you don't hear back within a few business days, please comment here to nudge — that's the right thing to do, not annoying.
- When your change is accepted, this PR closes automatically. Don't be alarmed when it closes — that's how it merges, and your authorship is preserved.

This comment will be updated as the status changes.`;
  }

  if (status === 'no-op') {
    return `${BRIDGE_COMMENT_MARKER}
I checked this PR, but there was no new change to sync.

${details}`;
  }

  if (status === 'closed') {
    return `${BRIDGE_COMMENT_MARKER}
This PR was closed without merging.

${details}`;
  }

  if (status === 'merged-upstream') {
    return `${BRIDGE_COMMENT_MARKER}
This PR was merged directly here. A maintainer will make sure the change is reconciled on our side.

${details}`;
  }

  return `${BRIDGE_COMMENT_MARKER}
I could not sync this PR automatically. A maintainer will look into it.

${details}`;
}

async function upsertIssueComment({ token, repo, issueNumber, body }) {
  // Paginate to find the bridge comment (handles PRs with 100+ comments)
  let comments = [];
  let page = 1;
  while (true) {
    const batch = await githubRequest({
      token,
      path: `/repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
    });
    comments = comments.concat(batch);
    if (batch.length < 100) break;
    page++;
  }

  const existing = comments.find((comment) => comment.body?.includes(BRIDGE_COMMENT_MARKER));
  if (existing) {
    await githubRequest({
      token,
      method: 'PATCH',
      path: `/repos/${repo}/issues/comments/${existing.id}`,
      body: { body },
    });
    return existing.html_url;
  }

  const created = await githubRequest({
    token,
    method: 'POST',
    path: `/repos/${repo}/issues/${issueNumber}/comments`,
    body: { body },
  });
  return created.html_url;
}

async function findOpenInternalPr({ token, repo, owner, branchName }) {
  const pulls = await githubRequest({
    token,
    path: `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}`,
  });
  return pulls[0] ?? null;
}

async function ensureDraftState({ token, pullRequest, shouldBeDraft }) {
  if (Boolean(pullRequest.draft) === Boolean(shouldBeDraft)) {
    return;
  }

  const query = shouldBeDraft
    ? `mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { id } } }`
    : `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id } } }`;

  await githubGraphql({
    token,
    query,
    variables: { id: pullRequest.node_id },
  });
}

async function syncPublicPr() {
  const publicToken = requireEnv('PUBLIC_TOKEN');
  const internalToken = requireEnv('INTERNAL_TOKEN');
  const publicRepo = requireEnv('PUBLIC_REPO');
  const internalRepo = requireEnv('INTERNAL_REPO');
  const internalRepoDir = requireEnv('INTERNAL_REPO_DIR');
  const mirrorPath = requireEnv('MONOREPO_PATH_PREFIX');
  const internalBaseRef = requireEnv('INTERNAL_BASE_REF');
  const internalBranchPrefix = requireEnv('INTERNAL_BRANCH_PREFIX');
  const publicPrAction = process.env.PUBLIC_PR_ACTION ?? 'opened';
  const publicPrNumber = Number.parseInt(requireEnv('PUBLIC_PR_NUMBER'), 10);
  const pathRewrites = parseJsonEnv('PUBLIC_PR_PATH_REWRITES', {});
  const internalOwner = internalRepo.split('/')[0];
  const branchName = getPublicPrBranchName(internalBranchPrefix, publicPrNumber);

  const publicPr = await githubRequest({
    token: publicToken,
    path: `/repos/${publicRepo}/pulls/${publicPrNumber}`,
  });

  let internalPr = await findOpenInternalPr({
    token: internalToken,
    repo: internalRepo,
    owner: internalOwner,
    branchName,
  });

  const metadataOnlyAction =
    internalPr &&
    (publicPrAction === 'edited' ||
      publicPrAction === 'ready_for_review' ||
      publicPrAction === 'converted_to_draft');

  let hasStagedChanges = false;
  if (!metadataOnlyAction) {
    // Bring agents-private's main into the local clone and check out the new
    // branch first. We need this in place before the public-PR-refs fetch so
    // any blob already on main is deduplicated; we also need it before
    // `git apply --3way` (later) regardless.
    run('git', ['-C', internalRepoDir, 'fetch', 'origin', internalBaseRef, '--prune']);
    run('git', ['-C', internalRepoDir, 'checkout', '-B', branchName, `origin/${internalBaseRef}`]);

    // Fetch the public PR's base + head into agents-private's object store.
    // Two purposes:
    //   1. `git apply --3way` resolves the patch's base blobs locally even
    //      when public-mirror-sync is stalled and agents-private/main has
    //      drifted from `inkeep/<repo>/main`. Without this, every conflicting
    //      hunk fails with "repository lacks the necessary blob to perform
    //      3-way merge" — the dominant bridge-failure pattern observed on
    //      `inkeep/open-knowledge-legacy#411`, `#396`, `#374`.
    //   2. Provides the baseline pair of refs for the local-git-diff fallback
    //      when the GitHub diff endpoint rejects the PR as too large.
    const sourceRemote = `bridge-public-${publicPrNumber}`;
    const sourceBaseRef = `refs/remotes/${sourceRemote}/pr-base`;
    const sourceHeadRef = `refs/remotes/${sourceRemote}/pr-head`;
    const publicRepoUrl = `https://x-access-token:${publicToken}@github.com/${publicRepo}.git`;

    try {
      run('git', ['-C', internalRepoDir, 'remote', 'remove', sourceRemote]);
    } catch {
      // remote did not exist; harmless
    }
    run('git', ['-C', internalRepoDir, 'remote', 'add', sourceRemote, publicRepoUrl]);

    try {
      // Initial fetch: --depth=10000 covers the long-running branches that
      // trip the size-fallback (e.g. inkeep/open-knowledge-legacy#377 with 78
      // commits). On the rare branch whose merge-base is deeper, the
      // subsequent `git diff base...head` errors clearly with "no merge
      // base" rather than producing a wrong diff — so we re-fetch with
      // increasing depth before giving up.
      let refsFetched = false;
      for (const depth of [10000, 50000]) {
        try {
          run('git', [
            '-C',
            internalRepoDir,
            'fetch',
            '--no-tags',
            `--depth=${depth}`,
            sourceRemote,
            `+refs/pull/${publicPrNumber}/head:${sourceHeadRef}`,
            `+refs/heads/${publicPr.base.ref}:${sourceBaseRef}`,
          ]);
          refsFetched = true;
          break;
        } catch (error) {
          console.log(
            `Bridge: fetch at --depth=${depth} failed: ${error.message}. ` +
              `Retrying with deeper history if available.`
          );
        }
      }
      if (!refsFetched) {
        console.log(
          'Bridge: warning: could not fetch public PR refs into agents-private at any depth. ' +
            "Continuing — `git apply --3way` will still succeed if the public mirror's blobs already match agents-private/main, " +
            'but the local-git-diff fallback for oversized PRs will not be available.'
        );
      }

      // Use .diff (unified squash diff) not .patch (multi-commit mailbox
      // format). .patch returns one patch per PR commit, each with
      // intermediate blob SHAs that only exist in inkeep/agents' object
      // store; any conflicting hunk forces git apply --3way to look up
      // those intermediates and fail with "repository lacks the necessary
      // blob". .diff is a single base-vs-head diff — no intermediates,
      // only the PR base blobs are referenced.
      //
      // For PRs whose .diff exceeds GitHub's 20,000-line endpoint cap,
      // fetchPullRequestDiff falls back to a local 3-dot `git diff`
      // against the refs we just fetched.
      const rawPatch = await fetchPullRequestDiff({
        publicToken,
        publicRepo,
        publicPr,
        internalRepoDir,
        sourceBaseRef,
        sourceHeadRef,
        refsFetched,
      });
      const excludedPrefixes = parseJsonEnv('BRIDGE_EXCLUDED_PATHS', []);
      const patch = filterDiffByPath(rawPatch, excludedPrefixes);

      if (!patch.trim()) {
        const details =
          rawPatch.trim() && excludedPrefixes.length > 0
            ? `Every diff section matched an excluded path prefix (\`${excludedPrefixes.join('`, `')}\`), so there was nothing left to port.`
            : 'GitHub returned an empty patch, so there was nothing to port.';
        await upsertIssueComment({
          token: publicToken,
          repo: publicRepo,
          issueNumber: publicPrNumber,
          body: buildPublicComment({
            publicPr,
            status: 'no-op',
            details,
          }),
        });
        return;
      }

      const tempDir = mkdtempSync(path.join(tmpdir(), 'public-pr-bridge-'));
      const patchFile = path.join(tempDir, 'public-pr.patch');
      writeFileSync(patchFile, prefixPatchPaths(patch, mirrorPath, pathRewrites), 'utf8');

      try {
        try {
          run('git', ['-C', internalRepoDir, 'apply', '--index', '--3way', patchFile]);
        } catch (error) {
          // error.message has already been routed through `run()` which
          // sanitizes any embedded x-access-token URL, so it's safe to surface
          // verbatim. Including the actual git output makes the failure
          // actionable for external contributors who can't read internal
          // workflow logs (matches agents-optional-local-dev's behavior).
          await upsertIssueComment({
            token: publicToken,
            repo: publicRepo,
            issueNumber: publicPrNumber,
            body: buildPublicComment({
              publicPr,
              status: 'failed',
              details:
                'Patch application failed. The diff could not be applied cleanly. ' +
                `Try rebasing your PR on the latest base branch.\n\n\`\`\`\n${error.message}\n\`\`\``,
            }),
          });
          throw error;
        }

        hasStagedChanges = (() => {
          try {
            run('git', ['-C', internalRepoDir, 'diff', '--cached', '--quiet']);
            return false;
          } catch {
            return true;
          }
        })();

        if (hasStagedChanges) {
          run('git', ['-C', internalRepoDir, 'config', 'user.name', 'Inkeep Public PR Bridge']);
          run('git', [
            '-C',
            internalRepoDir,
            'config',
            'user.email',
            'public-pr-bridge@inkeep.com',
          ]);

          let commitAuthors = [];
          try {
            commitAuthors = await listPublicPrCommitAuthors({
              token: publicToken,
              repo: publicRepo,
              prNumber: publicPr.number,
            });
          } catch (error) {
            console.warn(
              `Bridge: could not fetch public PR commit authors; falling back to PR opener attribution: ${error.message}`
            );
          }
          const { trailers } = buildCommitAttribution({
            commitAuthors,
            fallbackAuthor: fallbackPublicAuthor(publicPr),
          });
          run('git', [
            '-C',
            internalRepoDir,
            'commit',
            '-m',
            `chore(sync): mirror ${publicRepo}#${publicPr.number}`,
            '-m',
            trailers.join('\n'),
          ]);

          run('git', [
            '-C',
            internalRepoDir,
            'push',
            '--force-with-lease',
            '--set-upstream',
            'origin',
            branchName,
          ]);
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } finally {
      // Always tear down the bridge-public remote, even on early return or
      // throw, so subsequent runs (or a retry of the same PR) start clean.
      try {
        run('git', ['-C', internalRepoDir, 'remote', 'remove', sourceRemote]);
      } catch {
        // best-effort
      }
    }

    internalPr = await findOpenInternalPr({
      token: internalToken,
      repo: internalRepo,
      owner: internalOwner,
      branchName,
    });

    if (!internalPr && !hasStagedChanges) {
      await upsertIssueComment({
        token: publicToken,
        repo: publicRepo,
        issueNumber: publicPrNumber,
        body: buildPublicComment({
          publicPr,
          status: 'no-op',
          details: 'The change already appears to be present, so there was nothing new to sync.',
        }),
      });
      return;
    }
  }

  const title = internalPullRequestTitle(publicPr);
  const body = buildInternalPrBody({ publicPr, branchName, mirrorPath });

  if (internalPr) {
    internalPr = await githubRequest({
      token: internalToken,
      method: 'PATCH',
      path: `/repos/${internalRepo}/pulls/${internalPr.number}`,
      body: { title, body },
    });
    await ensureDraftState({
      token: internalToken,
      pullRequest: internalPr,
      shouldBeDraft: publicPr.draft,
    });
  } else {
    internalPr = await githubRequest({
      token: internalToken,
      method: 'POST',
      path: `/repos/${internalRepo}/pulls`,
      body: {
        title,
        head: branchName,
        base: internalBaseRef,
        body,
        draft: publicPr.draft,
      },
    });
  }

  await upsertIssueComment({
    token: publicToken,
    repo: publicRepo,
    issueNumber: publicPrNumber,
    body: buildPublicComment({
      publicPr,
      internalPr,
      status: 'synced',
    }),
  });
}

async function closeLinkedInternalPr() {
  const publicToken = requireEnv('PUBLIC_TOKEN');
  const internalToken = requireEnv('INTERNAL_TOKEN');
  const publicRepo = requireEnv('PUBLIC_REPO');
  const internalRepo = requireEnv('INTERNAL_REPO');
  const internalBranchPrefix = requireEnv('INTERNAL_BRANCH_PREFIX');
  const publicPrNumber = Number.parseInt(requireEnv('PUBLIC_PR_NUMBER'), 10);
  const internalOwner = internalRepo.split('/')[0];
  const branchName = getPublicPrBranchName(internalBranchPrefix, publicPrNumber);

  const publicPr = await githubRequest({
    token: publicToken,
    path: `/repos/${publicRepo}/pulls/${publicPrNumber}`,
  });

  const internalPr = await findOpenInternalPr({
    token: internalToken,
    repo: internalRepo,
    owner: internalOwner,
    branchName,
  });

  if (!internalPr) {
    return;
  }

  if (publicPr.merged_at) {
    await upsertIssueComment({
      token: publicToken,
      repo: publicRepo,
      issueNumber: publicPrNumber,
      body: buildPublicComment({
        publicPr,
        internalPr,
        status: 'merged-upstream',
        details: '',
      }),
    });
    return;
  }

  await githubRequest({
    token: internalToken,
    method: 'POST',
    path: `/repos/${internalRepo}/issues/${internalPr.number}/comments`,
    body: {
      body: `Closing because the linked public PR [#${publicPr.number}](${publicPr.html_url}) was closed without merge.`,
    },
  });

  await githubRequest({
    token: internalToken,
    method: 'PATCH',
    path: `/repos/${internalRepo}/pulls/${internalPr.number}`,
    body: { state: 'closed' },
  });

  // Clean up the stale branch on agents-private
  try {
    await githubRequest({
      token: internalToken,
      method: 'DELETE',
      path: `/repos/${internalRepo}/git/refs/heads/${branchName}`,
    });
  } catch {
    // Branch may already be deleted or protected
  }

  await upsertIssueComment({
    token: publicToken,
    repo: publicRepo,
    issueNumber: publicPrNumber,
    body: buildPublicComment({
      publicPr,
      status: 'closed',
      details: '',
    }),
  });
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'sync') {
    await syncPublicPr();
    return;
  }

  if (mode === 'close') {
    await closeLinkedInternalPr();
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export {
  buildCommitAttribution,
  buildInternalPrBody,
  buildPublicComment,
  listPublicPrCommitAuthors,
  prefixPatchPaths,
};
