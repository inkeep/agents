import { describe, expect, it } from 'vitest';
import {
  isManageRouteExemptFromBranchScopedDb,
  MANAGE_BRANCH_SCOPED_DB_EXEMPT_ROUTES,
} from '../../middleware/manageBranchScopedDbExemptions';

const T = '/manage/tenants/default';

describe('isManageRouteExemptFromBranchScopedDb', () => {
  describe('exempt routes (no manage Doltgres usage)', () => {
    const exempt = [
      `${T}/signoz/query`,
      `${T}/signoz/query-batch`,
      `${T}/signoz/span-lookup`,
      `${T}/signoz/health`,
      `${T}/github/callback`,
      `${T}/entitlements`,
      `${T}/entitlements/usage`,
      `${T}/projects/proj-1/github-access`,
      `${T}/projects/proj-1/feedback`,
      // Conversations family (list / detail / bounds / media) is runtime+blob only.
      `${T}/projects/proj-1/conversations`,
      `${T}/projects/proj-1/conversations/conv-1`,
      `${T}/projects/proj-1/conversations/conv-1/bounds`,
      `${T}/projects/proj-1/conversations/conv-1/media/some-key`,
      `${T}/projects/proj-1/api-keys`,
      `${T}/projects/proj-1/api-keys/key-1`,
      `${T}/projects/proj-1/apps/app-1/auth/keys`,
      `${T}/projects/proj-1/apps/app-1/auth/keys/kid-1`,
      `${T}/projects/proj-1/credential-stores`,
      `${T}/projects/proj-1/credential-stores/store-1/credentials`,
      `${T}/projects/proj-1/permissions`,
      `${T}/projects/proj-1/mcp-catalog`,
      `${T}/projects/proj-1/third-party-mcp-servers`,
      `${T}/projects/proj-1/third-party-mcp-servers/oauth-redirect`,
      `${T}/projects/proj-1/evals/evaluation-results`,
      `${T}/projects/proj-1/evals/evaluation-results/result-1`,
      `${T}/apps`,
      `${T}/apps/some-app`,
      `${T}/users/user-1/project-memberships`,
      `${T}/password-reset-links`,
    ];
    it.each(exempt)('exempts %s', (path) => {
      expect(isManageRouteExemptFromBranchScopedDb(path)).toBe(true);
    });
  });

  describe('kept routes (use the branch-scoped db)', () => {
    const kept = [
      // Core CRUD
      `${T}/projects/proj-1/agents`,
      `${T}/projects/proj-1/tools`,
      `${T}/projects/proj-1/credentials`,
      `${T}/projects`,
      `${T}/project-full/proj-1`,
      `${T}/playground/token`,
      // Tool-level access routes DO use the branch-scoped db — must not be
      // swept up by the project-level github-access exemption.
      `${T}/projects/proj-1/tools/tool-1/github-access`,
      `${T}/projects/proj-1/tools/tool-1/slack-access`,
      // `/apps` and `/apps/:appId` use the branch-scoped db (PATCH validates a
      // support_copilot credential reference) — only the nested auth-key router
      // is exempt, so these must stay kept.
      `${T}/projects/proj-1/apps`,
      `${T}/projects/proj-1/apps/app-1`,
      // Every other evals sub-router uses the branch-scoped db — only
      // evaluation-results is exempt. Pin them all (especially the
      // `evaluation-`-prefixed siblings) so a future over-broadening of the
      // exemption regex toward /evals or the shared prefix is caught here.
      `${T}/projects/proj-1/evals/datasets`,
      `${T}/projects/proj-1/evals/evaluators`,
      `${T}/projects/proj-1/evals/dataset-items`,
      `${T}/projects/proj-1/evals/dataset-runs`,
      `${T}/projects/proj-1/evals/dataset-run-configs`,
      `${T}/projects/proj-1/evals/evaluation-job-configs`,
      `${T}/projects/proj-1/evals/evaluation-run-configs`,
      `${T}/projects/proj-1/evals/evaluation-suite-configs`,
    ];
    it.each(kept)('does not exempt %s', (path) => {
      expect(isManageRouteExemptFromBranchScopedDb(path)).toBe(false);
    });
  });

  describe('path-boundary safety', () => {
    it('does not match on a route-name prefix without a segment boundary', () => {
      // `signozzz` / `github-foo` share a prefix but are different segments.
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/signozzz`)).toBe(false);
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/github-foo`)).toBe(false);
    });

    it('only exempts tenant-level /apps, not a deeper project-scoped apps path', () => {
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/apps`)).toBe(false);
    });

    it('exempts only the nested app auth-keys router, not the /apps CRUD routes', () => {
      expect(
        isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/apps/app-1/auth/keys`)
      ).toBe(true);
      // The parent app routes use the branch-scoped db (PATCH credential check).
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/apps`)).toBe(false);
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/apps/app-1`)).toBe(false);
    });

    it('exempts only evals/evaluation-results, not its db-backed evals siblings', () => {
      expect(
        isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/evals/evaluation-results`)
      ).toBe(true);
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/evals/datasets`)).toBe(
        false
      );
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/evals`)).toBe(false);
    });

    it('exempts /credential-stores without sweeping in the sibling /credentials router', () => {
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/credential-stores`)).toBe(
        true
      );
      expect(isManageRouteExemptFromBranchScopedDb(`${T}/projects/proj-1/credentials`)).toBe(false);
    });

    it('requires the /manage/tenants prefix', () => {
      expect(isManageRouteExemptFromBranchScopedDb('/manage/api/users')).toBe(false);
      expect(isManageRouteExemptFromBranchScopedDb('/run/tenants/default/signoz/query')).toBe(
        false
      );
    });
  });

  it('every table entry has a name, reason, and both-end-anchored pattern', () => {
    for (const route of MANAGE_BRANCH_SCOPED_DB_EXEMPT_ROUTES) {
      expect(route.name).toBeTruthy();
      expect(route.reason).toBeTruthy();
      expect(route.path.source.startsWith('^\\/manage\\/tenants\\/')).toBe(true);
      // Trailing segment-boundary guard is mandatory: without it a pattern like
      // `/signoz` would also match `/signozzz`, wrongly exempting a sibling.
      expect(route.path.source.endsWith('(?:\\/|$)')).toBe(true);
    }
  });
});
