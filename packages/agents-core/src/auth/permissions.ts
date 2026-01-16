import type { AccessControl } from 'better-auth/plugins/access';
import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

// Re-export organizationClient so consumers use the same package instance as ac/roles
export { organizationClient } from 'better-auth/client/plugins';

const statement = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statement) as AccessControl;

export const memberRole = ac.newRole({
  project: ['read'],
  ...memberAc.statements,
});

export const adminRole = ac.newRole({
  project: ['create', 'read', 'update', 'delete'],
  ...adminAc.statements,
});

export const ownerRole = ac.newRole({
  project: ['create', 'read', 'update', 'delete'],
  ...ownerAc.statements,
});
