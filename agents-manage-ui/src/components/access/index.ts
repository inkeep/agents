// Components
export { AccessRoleDropdown } from './access-role-dropdown';
// Hooks
export { useProjectAccess } from './hooks/use-project-access';
export { PrincipalAvatar } from './principal-avatar';
export { ProjectMembersWrapper } from './project-members-wrapper';
export { ResourceMembersPage } from './resource-members-page';

// Types
export type {
  // Principal types
  AccessPrincipal,
  // Role types
  AccessRole,
  PrincipalMetadata,
  PrincipalType,
  // API types
  ProjectMemberFromApi,
  // Resource types
  ResourceType,
} from './types';

// Helper functions
export { getPrincipalIcon, getPrincipalTypeLabel } from './types';
