import { describe, expect, it } from 'vitest';
import { isProjectDeleteOperation } from '../branch-scoped-db';

describe('isProjectDeleteOperation', () => {
  it('matches DELETE /tenants/:tenantId/projects/:projectId (with optional trailing slash)', () => {
    expect(isProjectDeleteOperation('/tenants/default/projects/activities-planner', 'DELETE')).toBe(
      true
    );
    expect(
      isProjectDeleteOperation('/tenants/default/projects/activities-planner/', 'DELETE')
    ).toBe(true);
  });

  it('matches DELETE /tenants/:tenantId/project-full/:projectId', () => {
    expect(
      isProjectDeleteOperation('/tenants/default/project-full/activities-planner', 'DELETE')
    ).toBe(true);
  });

  it('does not match non-DELETE methods or other paths', () => {
    expect(isProjectDeleteOperation('/tenants/default/projects/activities-planner', 'GET')).toBe(
      false
    );
    expect(isProjectDeleteOperation('/tenants/default/projects', 'DELETE')).toBe(false);
    expect(
      isProjectDeleteOperation('/tenants/default/projects/activities-planner/agents', 'DELETE')
    ).toBe(false);
  });
});
