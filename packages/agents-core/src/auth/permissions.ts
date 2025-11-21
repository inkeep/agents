import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  agent: ['create', 'read', 'update', 'delete'],
  sub_agent: ['create', 'read', 'update', 'delete'],
  tool: ['create', 'read', 'update', 'delete'],
  api_key: ['create', 'read', 'update', 'delete'],
  credential: ['create', 'read', 'update', 'delete'],
  data_component: ['create', 'read', 'update', 'delete'],
  artifact_component: ['create', 'read', 'update', 'delete'],
  external_agent: ['create', 'read', 'update', 'delete'],
  function: ['create', 'read', 'update', 'delete'],
  context_config: ['create', 'read', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statement);

export const memberRole = ac.newRole({
  project: ['read'],
  agent: ['read'],
  sub_agent: ['read'],
  tool: ['read'],
  api_key: ['read'],
  credential: ['read'],
  data_component: ['read'],
  artifact_component: ['read'],
  external_agent: ['read'],
  function: ['read'],
  context_config: ['read'],
});

export const adminRole = ac.newRole({
  project: ['create', 'read', 'update'],
  agent: ['create', 'read', 'update'],
  sub_agent: ['create', 'read', 'update'],
  tool: ['create', 'read', 'update'],
  api_key: ['create', 'read', 'update'],
  credential: ['create', 'read', 'update'],
  data_component: ['create', 'read', 'update'],
  artifact_component: ['create', 'read', 'update'],
  external_agent: ['create', 'read', 'update'],
  function: ['create', 'read', 'update'],
  context_config: ['create', 'read', 'update'],
  ...adminAc.statements,
});

export const ownerRole = ac.newRole({
  project: ['create', 'read', 'update', 'delete'],
  agent: ['create', 'read', 'update', 'delete'],
  sub_agent: ['create', 'read', 'update', 'delete'],
  tool: ['create', 'read', 'update', 'delete'],
  api_key: ['create', 'read', 'update', 'delete'],
  credential: ['create', 'read', 'update', 'delete'],
  data_component: ['create', 'read', 'update', 'delete'],
  artifact_component: ['create', 'read', 'update', 'delete'],
  external_agent: ['create', 'read', 'update', 'delete'],
  function: ['create', 'read', 'update', 'delete'],
  context_config: ['create', 'read', 'update', 'delete'],
  ...adminAc.statements,
});
