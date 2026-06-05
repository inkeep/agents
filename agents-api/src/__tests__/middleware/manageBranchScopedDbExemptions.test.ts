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

    it('requires the /manage/tenants prefix', () => {
      expect(isManageRouteExemptFromBranchScopedDb('/manage/api/users')).toBe(false);
      expect(isManageRouteExemptFromBranchScopedDb('/run/tenants/default/signoz/query')).toBe(
        false
      );
    });
  });

  it('every table entry has a name, reason, and anchored pattern', () => {
    for (const route of MANAGE_BRANCH_SCOPED_DB_EXEMPT_ROUTES) {
      expect(route.name).toBeTruthy();
      expect(route.reason).toBeTruthy();
      expect(route.path.source.startsWith('^\\/manage\\/tenants\\/')).toBe(true);
    }
  });
});
