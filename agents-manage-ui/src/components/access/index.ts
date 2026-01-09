// Components
export { AccessRoleDropdown } from './access-role-dropdown';
export { AccessSection } from './access-section';
export { AddAccessDialog } from './add-access-dialog';
export { ExplicitAccessList } from './explicit-access-list';
// Hooks
export { useProjectAccess } from './hooks/use-project-access';
export { InheritedAccessCard } from './inherited-access-card';
export { PrincipalAvatar } from './principal-avatar';
export { ProjectAccessWrapper } from './project-access-wrapper';
export { ShareProjectPage } from './share-project-page';
export { ShareProjectWrapper } from './share-project-wrapper';

// Types
export type {
  // Principal types
  AccessPrincipal,
  // Role types
  AccessRole,
  // Component props
  AccessSectionProps,
  AddAccessDialogProps,
  AgentMetadata,
  ExplicitAccessConfig,
  ExplicitAccessListProps,
  GroupMetadata,
  InheritedAccessCardProps,
  // Access config types
  InheritedAccessConfig,
  PrincipalMetadata,
  PrincipalType,
  // API types
  ProjectMemberFromApi,
  // Resource types
  ResourceType,
  ServiceAccountMetadata,
  UserMetadata,
  WorkflowMetadata,
} from './types';

// Helper functions
export { getPrincipalIcon, getPrincipalTypeLabel } from './types';
